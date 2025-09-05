import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: "admin" | "employee"; // Add role
  avatar?: string;
  googleId?: string;
  company?: string; // company id reference
}

const userSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }
  ,
  role: {
    type: String,
    enum: ["admin", "employee"],
    default: "employee",
  }
  ,
  avatar: { type: String },
  googleId: { type: String }
  ,
  company: { type: Schema.Types.ObjectId, ref: "Company", required: false }
});

export default mongoose.model<IUser>("User", userSchema);
