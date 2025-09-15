"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMongoUri = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const getMongoUri = () => {
    const direct = process.env.MONGO_URI?.trim();
    if (direct)
        return direct;
    const user = process.env.MONGO_USER;
    const pass = process.env.MONGO_PASS;
    const host = process.env.MONGO_HOST || "cluster0.abcd.mongodb.net"; // update to your cluster host
    const db = process.env.MONGO_DB || "remoteoffice";
    if (!user || !pass) {
        throw new Error("Missing MONGO_URI or (MONGO_USER and MONGO_PASS). Provide either MONGO_URI or individual credentials.");
    }
    const safeUser = encodeURIComponent(user);
    const safePass = encodeURIComponent(pass);
    return `mongodb+srv://${safeUser}:${safePass}@${host}/${db}?retryWrites=true&w=majority`;
};
exports.getMongoUri = getMongoUri;
const connectDB = async () => {
    try {
        const uri = (0, exports.getMongoUri)();
        const conn = await mongoose_1.default.connect(uri);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    }
    catch (error) {
        console.error("MongoDB connection failed:", error);
        process.exit(1);
    }
};
exports.default = connectDB;
