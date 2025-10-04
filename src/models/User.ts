import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  // legacy combined name for backward compatibility
  name: string;
  // new structured profile fields
  firstName?: string;
  lastName?: string;
  email: string;
  password: string;
  role: "superadmin" | "company_admin" | "employee" | "member";
  avatar?: string; // legacy avatar field
  avatarUrl?: string; // new avatar URL field
  avatarPublicId?: string; // Cloudinary public id for cleanup
  googleId?: string;
  phone?: string;
  jobTitle?: string;
  timezone?: string;
  language?: string; // default 'en'
  status?: "active" | "inactive";
  country?: string;
  address?: string;
  company?: string; // company id reference
  // Security fields
  requirePasswordChange?: boolean; // Force password change on first login
  // Chat-related fields
  chatStatus?: "online" | "offline" | "away" | "busy";
  lastSeen?: Date;
  socketIds?: string[]; // Track multiple socket connections for security
  createdAt: Date;
  updatedAt: Date;
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
    enum: ["superadmin", "company_admin", "employee", "member"],
    default: "employee",
  },
  avatar: { type: String },
  avatarUrl: { type: String },
  avatarPublicId: { type: String },
  googleId: { type: String },
  phone: { type: String },
  jobTitle: { type: String },
  timezone: { type: String },
  language: { type: String, default: "en" },
  status: { type: String, enum: ["active", "inactive"], default: "active" },
  country: { type: String },
  address: { type: String },
  company: { type: Schema.Types.ObjectId, ref: "Company", required: false },
  // Security fields
  requirePasswordChange: { type: Boolean, default: false },
  // Chat-related fields
  chatStatus: { 
    type: String, 
    enum: ["online", "offline", "away", "busy"], 
    default: "offline" 
  },
  lastSeen: { type: Date, default: Date.now },
  socketIds: [{ type: String }], // Array of socket IDs for multi-device support
}, { timestamps: true });

export default mongoose.model<IUser>("User", userSchema);
