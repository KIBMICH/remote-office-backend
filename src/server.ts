import express from "express";
import cors from "cors";
import session from "express-session";
import dotenv from "dotenv";
import connectDB, { getMongoUri } from "./config/db";
import passport from "./config/googleAuth";
import authRoutes from "./routes/authRoutes";
import googleAuthRoutes from "./routes/googleAuth";
import companyRoutes from "./routes/companyRoutes";
import userRoutes from "./routes/userRoutes";
import { authMiddleware } from "./middleware/authMiddleware";
import MongoStore from "connect-mongo";

// Load environment variables and connect DB
dotenv.config();
connectDB();

const app = express();
app.use(express.json());
// enable CORS so browser preflight (OPTIONS) is handled
app.use(cors());

// Session configuration for OAuth state management (use Mongo-backed store in production)
const SESSION_SECRET = process.env.SESSION_SECRET || "your-session-secret";
const isProd = process.env.NODE_ENV === "production";

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: getMongoUri(),
      collectionName: "sessions",
      ttl: 60 * 60, // 1 hour
      stringify: false,
    }),
    cookie: {
      secure: isProd, // requires HTTPS when in production
      httpOnly: true,
      sameSite: isProd ? "lax" : "lax",
      maxAge: 10 * 60 * 1000, // 10 minutes
    },
    proxy: isProd, // if behind a proxy (e.g., Render), trust proxy + secure cookies
  })
);

// initialize passport
app.use(passport.initialize());

// routes
app.use("/api/auth", authRoutes);
app.use("/api/auth", googleAuthRoutes);
app.use("/api/company", companyRoutes);
app.use("/api/users", userRoutes);

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
