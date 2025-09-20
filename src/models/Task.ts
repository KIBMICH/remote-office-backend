import mongoose, { Document, Schema, Types } from "mongoose";

export interface ITask extends Document {
  title: string;
  description: string;
  assignee: {
    id: Types.ObjectId;
    name: string;
    avatarUrl?: string;
  };
  dueDate: Date;
  priority: "high" | "medium" | "low";
  status: "todo" | "in_progress" | "done";
  project?: {
    id: Types.ObjectId;
    name: string;
  };
  tags?: string[];
  createdBy: Types.ObjectId; // user ID
  company: Types.ObjectId; // company ID for multi-tenancy
  createdAt?: Date;
  updatedAt?: Date;
}

const taskSchema = new Schema<ITask>({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  assignee: {
    id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    avatarUrl: { type: String }
  },
  dueDate: { type: Date, required: true },
  priority: {
    type: String,
    enum: ["high", "medium", "low"],
    default: "medium",
    required: true
  },
  status: {
    type: String,
    enum: ["todo", "in_progress", "done"],
    default: "todo",
    required: true
  },
  project: {
    id: { type: Schema.Types.ObjectId, ref: "Project" },
    name: { type: String }
  },
  tags: [{ type: String, trim: true }],
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  company: { type: Schema.Types.ObjectId, ref: "Company", required: true }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
taskSchema.index({ assignee: 1 });
taskSchema.index({ status: 1 });
taskSchema.index({ priority: 1 });
taskSchema.index({ dueDate: 1 });
taskSchema.index({ company: 1 });
taskSchema.index({ "project.id": 1 });
taskSchema.index({ createdBy: 1 });

// Compound indexes for common queries
taskSchema.index({ company: 1, status: 1 });
taskSchema.index({ company: 1, "assignee.id": 1 });
taskSchema.index({ company: 1, "project.id": 1 });

export default mongoose.model<ITask>("Task", taskSchema);
