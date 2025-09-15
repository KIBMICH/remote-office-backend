"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const express_session_1 = __importDefault(require("express-session"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = __importStar(require("./config/db"));
const googleAuth_1 = __importDefault(require("./config/googleAuth"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const googleAuth_2 = __importDefault(require("./routes/googleAuth"));
const companyRoutes_1 = __importDefault(require("./routes/companyRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const authMiddleware_1 = require("./middleware/authMiddleware");
const connect_mongo_1 = __importDefault(require("connect-mongo"));
// Load environment variables and connect DB
dotenv_1.default.config();
(0, db_1.default)();
const app = (0, express_1.default)();
app.use(express_1.default.json());
// enable CORS so browser preflight (OPTIONS) is handled
app.use((0, cors_1.default)());
// trust proxy when deployed behind a proxy (e.g., Render) so secure cookies work
if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}
// Session configuration for OAuth state management (use Mongo-backed store in production)
const SESSION_SECRET = process.env.SESSION_SECRET || "your-session-secret";
const isProd = process.env.NODE_ENV === "production";
app.use((0, express_session_1.default)({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: connect_mongo_1.default.create({
        mongoUrl: (0, db_1.getMongoUri)(),
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
