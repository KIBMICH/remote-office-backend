import mongoose from "mongoose";

export const getMongoUri = (): string => {
  const direct = process.env.MONGO_URI?.trim();
  if (direct) return direct;

  const user = process.env.MONGO_USER;
  const pass = process.env.MONGO_PASS;
  const host = process.env.MONGO_HOST || "cluster0.abcd.mongodb.net"; // update to your cluster host
  const db = process.env.MONGO_DB || "remoteoffice";

  if (!user || !pass) {
    throw new Error(
      "Missing MONGO_URI or (MONGO_USER and MONGO_PASS). Provide either MONGO_URI or individual credentials."
    );
  }

  const safeUser = encodeURIComponent(user);
  const safePass = encodeURIComponent(pass);
  return `mongodb+srv://${safeUser}:${safePass}@${host}/${db}?retryWrites=true&w=majority`;
};

const connectDB = async (): Promise<void> => {
  try {
    const uri = getMongoUri();
    const conn = await mongoose.connect(uri);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
};

export default connectDB;
