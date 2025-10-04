import express from "express";
import cors from "cors";
import session from "express-session";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import connectDB, { getMongoUri } from "./config/db";
import passport from "./config/googleAuth";
import authRoutes from "./routes/authRoutes";
import googleAuthRoutes from "./routes/googleAuth";
import companyRoutes from "./routes/companyRoutes";
import userRoutes from "./routes/userRoutes";
import taskRoutes from "./routes/taskRoutes";
import projectRoutes from "./routes/projectRoutes";
import dashboardRoutes from "./routes/dashboardRoutes";
import chatRoutes from "./routes/chatRoutes";
import { authMiddleware } from "./middleware/authMiddleware";
import { socketAuthMiddleware } from "./middleware/socketAuth";
import { initializeSocketEvents } from "./utils/socketEvents";
import MongoStore from "connect-mongo";

// Load environment variables and connect DB
dotenv.config();
connectDB();

const app = express();
app.use(express.json());
// enable CORS so browser preflight (OPTIONS) is handled
app.use(cors());
// trust proxy when deployed behind a proxy (e.g., Render) so secure cookies work
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

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
app.use("/api/tasks", taskRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/chat", chatRoutes);

// health/root route
app.get("/", (_req, res) => {
  res.send("RemoteOffice API is running 🚀");
});

// test protected route
app.get("/api/protected", authMiddleware, (req, res) => {
  res.json({ message: "You are authorized!" });
});

// Create HTTP server and Socket.IO instance
const server = createServer(app);

// Configure Socket.IO with security settings
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  },
  // Security: Configure transport options
  transports: ['websocket', 'polling'],
  // Performance: Configure connection settings
  pingTimeout: 60000,
  pingInterval: 25000,
  // Security: Limit max buffer size to prevent DoS
  maxHttpBufferSize: 1e6, // 1MB
  // Security: Configure cookie settings
  cookie: {
    name: "io",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  }
});

// Apply Socket.IO authentication middleware
io.use(socketAuthMiddleware);

// Initialize Socket.IO event handlers
initializeSocketEvents(io);

// Security: Handle Socket.IO errors
io.engine.on("connection_error", (err) => {
  console.error("Socket.IO connection error:", err);
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Socket.IO server initialized`);
  console.log(`🌐 CORS enabled for: ${process.env.FRONTEND_URL || "http://localhost:3000"}`);
});
