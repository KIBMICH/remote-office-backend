import mongoose, { Document, Schema, Types } from "mongoose";
import { IUser } from "./User";

export interface IProject extends Document {
  name: string;
  description?: string;
  progress: number; // 0-100
  dueDate: Date;
  members: IUser[];
  tasks: Types.ObjectId[]; // Task IDs
  status: "active" | "completed" | "on_hold" | "cancelled";
  createdBy: Types.ObjectId; // user ID
  company: Types.ObjectId; // company ID for multi-tenancy
  createdAt?: Date;
  updatedAt?: Date;
}

const projectSchema = new Schema<IProject>({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  progress: { 
    type: Number, 
    min: 0, 
    max: 100, 
    default: 0,
    required: true 
  },
  dueDate: { type: Date, required: true },
  members: [{ type: Schema.Types.ObjectId, ref: "User" }],
  tasks: [{ type: Schema.Types.ObjectId, ref: "Task" }],
  status: {
    type: String,
    enum: ["active", "completed", "on_hold", "cancelled"],
    default: "active",
    required: true
  },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  company: { type: Schema.Types.ObjectId, ref: "Company", required: true }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
projectSchema.index({ company: 1 });
projectSchema.index({ status: 1 });
projectSchema.index({ dueDate: 1 });
projectSchema.index({ createdBy: 1 });
projectSchema.index({ members: 1 });

// Compound indexes for common queries
projectSchema.index({ company: 1, status: 1 });
projectSchema.index({ company: 1, members: 1 });

// Virtual for calculating progress based on tasks
projectSchema.virtual('calculatedProgress').get(function() {
  // This will be calculated in the controller when tasks are populated
  return this.progress;
});

export default mongoose.model<IProject>("Project", projectSchema);
