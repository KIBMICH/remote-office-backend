import mongoose, { Document, Schema } from "mongoose";

export interface IChannel extends Document {
  name: string;
  type: "direct" | "group" | "project";
  participants: mongoose.Types.ObjectId[];
  projectId?: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId; // Security: Ensure channel belongs to a company
  lastMessage?: mongoose.Types.ObjectId;
  lastActivity: Date;
  createdBy: mongoose.Types.ObjectId;
  isArchived: boolean;
  // Security and moderation fields
  isPrivate: boolean;
  allowedRoles?: string[]; // Restrict access by roles
  maxParticipants?: number; // Prevent spam channels
  createdAt: Date;
  updatedAt: Date;
}

const channelSchema = new Schema<IChannel>({
  name: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: [100, "Channel name cannot exceed 100 characters"],
    validate: {
      validator: function(v: string) {
        // Security: Prevent XSS in channel names
        return /^[a-zA-Z0-9\s\-_#]+$/.test(v);
      },
      message: "Channel name contains invalid characters"
    }
  },
  type: { 
    type: String, 
    enum: ["direct", "group", "project"], 
    required: true 
  },
  participants: {
    type: [{ 
      type: Schema.Types.ObjectId, 
      ref: "User", 
      required: true
    }],
    validate: {
      validator: function(participants: mongoose.Types.ObjectId[]) {
        // Security: Limit participants to prevent abuse
        return participants.length <= 100;
      },
      message: "Channel cannot have more than 100 participants"
    }
  },
  projectId: { 
    type: Schema.Types.ObjectId, 
    ref: "Project",
    validate: {
      validator: function(this: IChannel, projectId: mongoose.Types.ObjectId) {
        // If type is project, projectId is required
        return this.type !== "project" || projectId != null;
      },
      message: "Project channels must have a valid project ID"
    }
  },
  companyId: { 
    type: Schema.Types.ObjectId, 
    ref: "Company", 
    required: true 
  },
  lastMessage: { 
    type: Schema.Types.ObjectId, 
    ref: "Message" 
  },
  lastActivity: { 
    type: Date, 
    default: Date.now,
    index: true // For efficient sorting
  },
  createdBy: { 
    type: Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  isArchived: { 
    type: Boolean, 
    default: false,
    index: true // For filtering archived channels
  },
  isPrivate: { 
    type: Boolean, 
    default: false 
  },
  allowedRoles: [{ 
    type: String,
    enum: ["superadmin", "company_admin", "employee", "member"]
  }],
  maxParticipants: { 
    type: Number, 
    default: 100,
    min: [2, "Channel must have at least 2 participants"],
    max: [100, "Channel cannot have more than 100 participants"]
  }
}, { 
  timestamps: true
});

// Security: Add indexes for efficient queries and prevent enumeration
channelSchema.index({ participants: 1, companyId: 1 });
channelSchema.index({ companyId: 1, type: 1, isArchived: 1 });
channelSchema.index({ projectId: 1 });
channelSchema.index({ createdBy: 1, companyId: 1 });
// Security: Compound index to prevent unauthorized access
channelSchema.index({ participants: 1, companyId: 1, isArchived: 1 });

// Pre-save middleware for additional security checks
channelSchema.pre('save', function(next) {
  // Ensure direct channels have exactly 2 participants
  if (this.type === 'direct' && this.participants.length !== 2) {
    return next(new Error('Direct channels must have exactly 2 participants'));
  }
  
  // Update last activity
  this.lastActivity = new Date();
  next();
});

export default mongoose.model<IChannel>("Channel", channelSchema);
