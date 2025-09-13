"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const express_session_1 = __importDefault(require("express-session"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = __importDefault(require("./config/db"));
const googleAuth_1 = __importDefault(require("./config/googleAuth"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const googleAuth_2 = __importDefault(require("./routes/googleAuth"));
const companyRoutes_1 = __importDefault(require("./routes/companyRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const authMiddleware_1 = require("./middleware/authMiddleware");
// Load environment variables and connect DB
dotenv_1.default.config();
(0, db_1.default)();
const app = (0, express_1.default)();
app.use(express_1.default.json());
// enable CORS so browser preflight (OPTIONS) is handled
app.use((0, cors_1.default)());
// Session configuration for OAuth state management
app.use((0, express_session_1.default)({
    secret: process.env.SESSION_SECRET || 'your-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 10 * 60 * 1000 } // 10 minutes
}));
// initialize passport
app.use(googleAuth_1.default.initialize());
// routes
app.use("/api/auth", authRoutes_1.default);
app.use("/api/auth", googleAuth_2.default);
app.use("/api/company", companyRoutes_1.default);
app.use("/api/users", userRoutes_1.default);
// health/root route
app.get("/", (_req, res) => {
    res.send("RemoteOffice API is running 🚀");
});
// test protected route
app.get("/api/protected", authMiddleware_1.authMiddleware, (req, res) => {
    res.json({ message: "You are authorized!" });
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
