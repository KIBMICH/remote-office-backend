"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const getMongoUri = () => {
    var _a;
    const direct = (_a = process.env.MONGO_URI) === null || _a === void 0 ? void 0 : _a.trim();
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
const connectDB = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const uri = getMongoUri();
        const conn = yield mongoose_1.default.connect(uri);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    }
    catch (error) {
        console.error("MongoDB connection failed:", error);
        process.exit(1);
    }
});
exports.default = connectDB;
