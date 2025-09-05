import mongoose, { Document, Schema } from "mongoose";

export interface ICompany extends Document {
  name: string;
  address?: string;
  createdBy: Schema.Types.ObjectId;
}

const companySchema = new Schema<ICompany>({
  name: { type: String, required: true, unique: true },
  address: { type: String },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
});

export default mongoose.model<ICompany>("Company", companySchema);
