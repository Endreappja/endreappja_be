import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import JwksRsa from "jwks-rsa";
import { expressjwt as jwt } from "express-jwt";
import http from "http";
import { Server } from "socket.io";
import admin from "firebase-admin";
import fs from "fs";

// const serviceAccount = JSON.parse(fs.readFileSync("firebase-service-account.json", "utf8"));

// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
// });

dotenv.config();

const auth0Domain = process.env.AUTH0_DOMAIN;
const checkJwt = jwt({
  secret: JwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `https://${auth0Domain}/.well-known/jwks.json`
  }),
  audience: process.env.AUTH0_AUDIENCE,
  issuer: `https://${auth0Domain}/`,
  algorithms: ['RS256']
});

const app = express();
const prisma = new PrismaClient();
let fcmTokens = [];

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN,
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log("⚡️ Kliens csatlakozott:", socket.id);

  socket.on("disconnect", () => {
    console.log("❌ Kliens lecsatlakozott:", socket.id);
  });
});

app.use(cors());
app.use(express.json());

app.use("/todos", checkJwt);
app.use("/register-token", checkJwt);
app.use("/broadcast", checkJwt);

// GET /todos
app.get("/todos", async (req, res) => {
  const todos = await prisma.todo.findMany();
  res.json(todos);
});

// POST /todos
app.post("/todos", async (req, res) => {
  const { title } = req.body;
  const newTodo = await prisma.todo.create({
    data: { title },
  });
  io.emit("newTodo", newTodo);
  res.json(newTodo);
});

// PUT /todos/:id
app.put("/todos/:id", async (req, res) => {
  const { id } = req.params;
  const { completed } = req.body;
  const updatedTodo = await prisma.todo.update({
    where: { id: parseInt(id) },
    data: { completed },
  });
  io.emit("todoUpdated", updatedTodo);
  res.json(updatedTodo);
});

// DELETE /todos/:id
app.delete("/todos/:id", async (req, res) => {
  const { id } = req.params;
  await prisma.todo.delete({
    where: { id: parseInt(id) },
  });
  io.emit("todoDeleted", parseInt(id));
  res.json({ message: "Todo deleted" });
});

app.post("/register-token", checkJwt, async (req, res) => {
  console.log("/register-token")
  const { token } = req.body;
  console.log(token)
  if (!token) return res.status(400).json({ error: "Missing token" });

  // JWT-ből kinyerjük az emailt
  const email = req.auth && req.auth.email;
  console.log(req.auth)
  if (!email) return res.status(400).json({ error: "Email not found in JWT" });

  try {
    // DB-be írás/upsert
    try {
      await prisma.fcmToken.upsert({
        where: { token },
        update: { email },
        create: { token, email }
      });
    } catch (err) {
      if (err.code === "P2002") {
        console.log("⚠️ Token already exists, skipping insert");
      } else {
        throw err;
      }
    }

    // Memóriában is frissítjük
    const exists = fcmTokens.find(t => t.token === token);
    if (!exists) {
      fcmTokens.push({ token, email });
    } else {
      exists.email = email;
    }

    console.log(`✅ Token registered/updated: ${token} (${email})`);
    res.json({ message: "Token registered" });
  } catch (err) {
    console.error("❌ Error registering token:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/broadcast", checkJwt, async (req, res) => {
  try {
    const tokens = await prisma.fcmToken.findMany();
    const registrationTokens = tokens.map(t => t.token);

    if (registrationTokens.length === 0) {
      return res.status(200).json({ message: "Nincsenek regisztrált kliensek" });
    }

    const now = new Date().toLocaleTimeString("hu-HU");
    const message = {
      notification: {
        title: "⏰ Broadcast",
        body: `Az idő most: ${now}`,
      },
      tokens: registrationTokens,
    };

    const response = await admin.messaging().sendMulticast(message);

    res.json({
      successCount: response.successCount,
      failureCount: response.failureCount,
    });
  } catch (err) {
    console.error("Broadcast error:", err);
    res.status(500).json({ error: "Broadcast failed" });
  }
});

async function loadFcmTokens() {
  const tokens = await prisma.fcmToken.findMany({ select: { token: true, email: true } });
  fcmTokens = tokens.map(t => ({ token: t.token, email: t.email }));
  console.log(`✅ FCM tokens loaded: ${fcmTokens.length}`);
}
loadFcmTokens();

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
