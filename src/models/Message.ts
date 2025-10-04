import mongoose, { Document, Schema } from "mongoose";

export interface IMessage extends Document {
  content: string;
  senderId: mongoose.Types.ObjectId;
  channelId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId; // Security: Ensure message belongs to a company
  type: "text" | "file" | "image" | "system";
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileMimeType?: string;
  isEdited: boolean;
  editedAt?: Date;
  replyTo?: mongoose.Types.ObjectId;
  // Security and moderation fields
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: mongoose.Types.ObjectId;
  // Read receipts (optional for future implementation)
  readBy?: Array<{
    userId: mongoose.Types.ObjectId;
    readAt: Date;
  }>;
  // Content moderation
  isModerated?: boolean;
  moderatedBy?: mongoose.Types.ObjectId;
  moderatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>({
  content: { 
    type: String, 
    required: function(this: IMessage) {
      // Content required for text messages, optional for files
      return this.type === 'text' || this.type === 'system';
    },
    maxlength: [4000, "Message content cannot exceed 4000 characters"],
    validate: {
      validator: function(v: string) {
        if (!v && this.type === 'text') return false;
        // Basic XSS prevention - strip HTML tags
        return !/<script|<iframe|javascript:|data:/i.test(v);
      },
      message: "Message content contains potentially harmful content"
    }
  },
  senderId: { 
    type: Schema.Types.ObjectId, 
    ref: "User", 
    required: true,
    index: true
  },
  channelId: { 
    type: Schema.Types.ObjectId, 
    ref: "Channel", 
    required: true,
    index: true
  },
  companyId: { 
    type: Schema.Types.ObjectId, 
    ref: "Company", 
    required: true,
    index: true
  },
  type: { 
    type: String, 
    enum: ["text", "file", "image", "system"], 
    default: "text",
    required: true
  },
  fileUrl: { 
    type: String,
    validate: {
      validator: function(this: IMessage, v: string) {
        // If type is file or image, fileUrl is required
        if ((this.type === 'file' || this.type === 'image') && !v) {
          return false;
        }
        // Validate URL format for security
        if (v && !/^https?:\/\/.+/.test(v)) {
          return false;
        }
        return true;
      },
      message: "Invalid file URL format"
    }
  },
  fileName: { 
    type: String,
    maxlength: [255, "File name cannot exceed 255 characters"],
    validate: {
      validator: function(v: string) {
        // Security: Prevent path traversal in file names
        return !v || !/[<>:"/\\|?*]/.test(v);
      },
      message: "File name contains invalid characters"
    }
  },
  fileSize: { 
    type: Number,
    min: [0, "File size cannot be negative"],
    max: [50 * 1024 * 1024, "File size cannot exceed 50MB"] // 50MB limit
  },
  fileMimeType: { 
    type: String,
    validate: {
      validator: function(v: string) {
        // Security: Whitelist allowed MIME types
        const allowedTypes = [
          'image/jpeg', 'image/png', 'image/gif', 'image/webp',
          'application/pdf', 'text/plain', 'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];
        return !v || allowedTypes.includes(v);
      },
      message: "File type not allowed"
    }
  },
  isEdited: { 
    type: Boolean, 
    default: false 
  },
  editedAt: { 
    type: Date 
  },
  replyTo: { 
    type: Schema.Types.ObjectId, 
    ref: "Message",
    validate: {
      validator: async function(this: IMessage, replyToId: mongoose.Types.ObjectId) {
        if (!replyToId) return true;
        
        // Security: Ensure reply-to message is in the same channel
        const Message = mongoose.model('Message');
        const replyMessage = await Message.findById(replyToId);
        return replyMessage && replyMessage.channelId.equals(this.channelId);
      },
      message: "Reply-to message must be in the same channel"
    }
  },
  isDeleted: { 
    type: Boolean, 
    default: false,
    index: true
  },
  deletedAt: { 
    type: Date 
  },
  deletedBy: { 
    type: Schema.Types.ObjectId, 
    ref: "User" 
  },
  readBy: [{
    userId: { 
      type: Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },
    readAt: { 
      type: Date, 
      default: Date.now 
    }
  }],
  isModerated: { 
    type: Boolean, 
    default: false 
  },
  moderatedBy: { 
    type: Schema.Types.ObjectId, 
    ref: "User" 
  },
  moderatedAt: { 
    type: Date 
  }
}, { 
  timestamps: true
});

// Indexes for efficient queries
messageSchema.index({ channelId: 1, createdAt: -1 }); // For message pagination
messageSchema.index({ senderId: 1, companyId: 1 });
messageSchema.index({ companyId: 1, isDeleted: 1 });
messageSchema.index({ channelId: 1, isDeleted: 1, createdAt: -1 });

// Security: Compound index for efficient and secure queries
messageSchema.index({ 
  channelId: 1, 
  companyId: 1, 
  isDeleted: 1, 
  createdAt: -1 
});

// Pre-save middleware for security and validation
messageSchema.pre('save', function(next) {
  // Set editedAt when message is edited
  if (this.isModified('content') && !this.isNew) {
    this.isEdited = true;
    this.editedAt = new Date();
  }
  
  // Set deletedAt when message is deleted
  if (this.isModified('isDeleted') && this.isDeleted) {
    this.deletedAt = new Date();
  }
  
  next();
});

// Instance method to safely get message content
messageSchema.methods.getSafeContent = function() {
  if (this.isDeleted) {
    return "[This message has been deleted]";
  }
  
  if (this.isModerated) {
    return "[This message has been moderated]";
  }
  
  return this.content;
};

export default mongoose.model<IMessage>("Message", messageSchema);
