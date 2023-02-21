const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.r4qaf.mongodb.net/?retryWrites=true&w=majority`;
const uri = `mongodb+srv://SA_Admin:XKXZn4oroeQOYkGZ@cluster0.r4qaf.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

//verify jwt
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "UnAuthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    await client.connect();
    const userCollection = client.db("sa_manufacturer").collection("user");
    const productCollection = client
      .db("sa_manufacturer")
      .collection("products");
    const orderCollection = client.db("sa_manufacturer").collection("orders");
    const reviewCollection = client.db("sa_manufacturer").collection("review");

    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const order = req.body;
      const price = order.price;
      const amount = price * 100;

      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "bdt",
        payment_method_types: ["card"],
      });
      //sendPaymentConfirmationEmail(service);
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    //verify admin
    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        next();
      } else {
        return res.status(403).send({ message: "Forbidden access" });
      }
    };
    //user
    //get user
    app.get("/user", verifyJWT, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });
    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      const users = await userCollection.findOne({ email: email });
      res.send(users);
    });
    //put user
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1h" }
      );
      res.send({ result, token });
    });
    //delete
    app.delete("/user/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });
    app.patch("/user/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const user = req.body;
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          email: user.email,
          userName: user.name,
          address: user.address,
          company: user.company,
          phone: user.phone,
          image: user.image,
        },
      };
      const updateUser = await userCollection.updateOne(filter, updateDoc);
      res.send(updateDoc);
    });

    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role == "admin";
      res.send({ admin: isAdmin });
    });
    //make admin
    app.put("/user/admin/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      console.log(email);
      const filter = { email: email };
      const updateDoc = {
        $set: { role: "admin" },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    //products
    //get
    app.get("/product", async (req, res) => {
      const page = parseInt(req.query.page);
      const size = parseInt(req.query.size);
      const query = {};
      // console.log("db :" + productCollection)
      const cursor = productCollection.find(query);
      // console.log("cursor :" +cursor)
      let products;
      if (page || size) {
        products = await cursor
          .skip(page * size)
          .limit(size)
          .toArray();
      } else {
        products = await cursor.toArray();

      }
      // console.log("products :"+ products)
      res.send(products);
    });

    app.get("/productCount", async (req, res) => {
      const count = await productCollection.estimatedDocumentCount();
      res.send({ count });
    });

    app.get("/product/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const cursor = productCollection.find(query);
      const product = await cursor.toArray();
      res.send(product);
    });

    //post
    app.post("/product", verifyJWT, verifyAdmin, async (req, res) => {
      const product = req.body;
      const result = await productCollection.insertOne(product);
      res.send(result);
    });

    //update
    app.patch("/product/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const product = req.body;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: product,
      };
      const updateProduct = await productCollection.updateOne(
        filter,
        updateDoc
      );
      res.send(updateProduct);
    });

    //delete
    app.delete("/product/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await productCollection.deleteOne(query);
      res.send(result);
    });

    //order
    app.get("/order", verifyJWT, async (req, res) => {
      const customer = req.query.customer;
      const decodedEmail = req.decoded.email;
      if (customer === decodedEmail) {
        const query = { customerEmail: customer };
        const result = await orderCollection.find(query).toArray();
        const order = result.reverse();
        return res.send(order);
      } else {
        return res.status(403).send({ message: "Forbidden access" });
      }
    });

    app.get("/order/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const order = await orderCollection.findOne(query);
      res.send(order);
    });
    app.post("/order", verifyJWT, async (req, res) => {
      const order = req.body;
      const result = await orderCollection.insertOne(order);
      res.send(result);
    });
    //update
    app.patch("/order/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const order = req.body;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: order,
      };
      const updateOrder = await orderCollection.updateOne(filter, updateDoc);
      res.send(updateOrder);
    });
    app.delete("/order/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await orderCollection.deleteOne(query);
      res.send(result);
    });
    app.get("/allorder", verifyJWT, verifyAdmin, async (req, res) => {
      const allorder = await orderCollection.find().toArray();
      res.send(allorder);
    });

    //review
    app.get("/review", async (req, res) => {
      const result = await reviewCollection.find().toArray();
      const reviews = result.reverse();
      res.send(reviews);
    });
    app.post("/review", verifyJWT, async (req, res) => {
      const review = req.body;
      const result = await reviewCollection.insertOne(review);
      res.send(result);
    });
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Look manufature server! Vercel update 2");
});

app.listen(port, () => {
  console.log("Listening to port", port);
});
