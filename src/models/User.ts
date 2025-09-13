import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  // legacy combined name for backward compatibility
  name: string;
  // new structured profile fields
  firstName?: string;
  lastName?: string;
  email: string;
  password: string;
  role: "admin" | "employee" | "owner" | "member";
  avatar?: string; // legacy avatar field
  avatarUrl?: string; // new avatar URL field
  googleId?: string;
  phone?: string;
  jobTitle?: string;
  timezone?: string;
  language?: string; // default 'en'
  status?: "active" | "inactive";
  company?: string; // company id reference
  createdAt?: Date;
  updatedAt?: Date;
}

const userSchema = new Schema<IUser>({
  // Keep legacy name required to avoid breaking existing registration flows
  name: { type: String, required: true },
  firstName: { type: String },
  lastName: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ["admin", "employee", "owner", "member"],
    default: "employee",
  },
  avatar: { type: String },
  avatarUrl: { type: String },
  googleId: { type: String },
  phone: { type: String },
  jobTitle: { type: String },
  timezone: { type: String },
  language: { type: String, default: "en" },
  status: { type: String, enum: ["active", "inactive"], default: "active" },
  company: { type: Schema.Types.ObjectId, ref: "Company", required: false },
}, { timestamps: true });

export default mongoose.model<IUser>("User", userSchema);
