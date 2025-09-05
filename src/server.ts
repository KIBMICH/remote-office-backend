import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db";
import passport from "./config/googleAuth";
import authRoutes from "./routes/authRoutes";
import googleAuthRoutes from "./routes/googleAuth";
import companyRoutes from "./routes/companyRoutes";
import { authMiddleware } from "./middleware/authMiddleware";

// Load environment variables and connect DB
dotenv.config();
connectDB();

const app = express();
app.use(express.json());
// enable CORS so browser preflight (OPTIONS) is handled
app.use(cors());

// initialize passport
app.use(express.json());
app.use(passport.initialize());

// routes
app.use("/api/auth", authRoutes);
app.use("/api/auth", googleAuthRoutes);
app.use("/api/company", companyRoutes);

// health/root route
app.get("/", (_req, res) => {
  res.send("RemoteOffice API is running 🚀");
});

// test protected route
app.get("/api/protected", authMiddleware, (req, res) => {
  res.json({ message: "You are authorized!" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
