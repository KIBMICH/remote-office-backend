import mongoose, { Schema, Document } from "mongoose";

export interface IAuditLog extends Document {
  actorId: Schema.Types.ObjectId;
  entityType: "user" | "company";
  entityId: Schema.Types.ObjectId;
  action: "update";
  changes: Record<string, any>;
  ip?: string;
  userAgent?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const auditLogSchema = new Schema<IAuditLog>({
  actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  entityType: { type: String, enum: ["user", "company"], required: true },
  entityId: { type: Schema.Types.ObjectId, required: true },
  action: { type: String, enum: ["update"], required: true },
  changes: { type: Schema.Types.Mixed, required: true },
  ip: { type: String },
  userAgent: { type: String },
}, { timestamps: true });

export default mongoose.model<IAuditLog>("AuditLog", auditLogSchema);
