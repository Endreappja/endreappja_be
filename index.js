import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import JwksRsa from "jwks-rsa";
import { expressjwt as jwt } from "express-jwt";

dotenv.config();

const checkJwt = jwt({
  secret: JwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `https://dev-vu1jkz4wuxvj1unq.us.auth0.com/.well-known/jwks.json`
  }),
  audience: 'https://endreapija.san/',
  issuer: `https://dev-vu1jkz4wuxvj1unq.us.auth0.com/`,
  algorithms: ['RS256']
});

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

app.use("/todos", checkJwt);

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
  res.json(updatedTodo);
});

// DELETE /todos/:id
app.delete("/todos/:id", async (req, res) => {
  const { id } = req.params;
  await prisma.todo.delete({
    where: { id: parseInt(id) },
  });
  res.json({ message: "Todo deleted" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
