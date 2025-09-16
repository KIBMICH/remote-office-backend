import mongoose, { Document, Schema } from "mongoose";

export interface ICompany extends Document {
  name: string;
  logoUrl?: string;
  logoPublicId?: string;
  industry?: string;
  address?: string;
  phone?: string;
  website?: string;
  email?: string;
  country?: string;
  subscriptionPlan?: "free" | "pro" | "enterprise";
  subscriptionStatus?: "active" | "canceled" | "trial";
  billingCycle?: "monthly" | "yearly";
  admin: Schema.Types.ObjectId; // Company admin who can manage users
  createdBy: Schema.Types.ObjectId; // Superadmin who created the company
  createdAt?: Date;
  updatedAt?: Date;
}

const companySchema = new Schema<ICompany>({
  name: { type: String, required: true, unique: true },
  logoUrl: { type: String },
  logoPublicId: { type: String },
  industry: { type: String },
  address: { type: String },
  phone: { type: String },
  website: { type: String },
  email: { type: String },
  country: { type: String },
  subscriptionPlan: { type: String, enum: ["free", "pro", "enterprise"], default: "free" },
  subscriptionStatus: { type: String, enum: ["active", "canceled", "trial"], default: "trial" },
  billingCycle: { type: String, enum: ["monthly", "yearly"], default: "monthly" },
  admin: { type: Schema.Types.ObjectId, ref: "User", required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

export default mongoose.model<ICompany>("Company", companySchema);
