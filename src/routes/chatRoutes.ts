import express from "express";
import rateLimit from "express-rate-limit";
import { authMiddleware } from "../middleware/authMiddleware";
import { validate } from "../middleware/validate";
import {
  createChannelSchema,
  sendMessageSchema,
  editMessageSchema,
  getMessagesSchema,
  updateChannelSchema,
  searchUsersSchema,
  markAsReadSchema
} from "../utils/chatValidation";
import {
  getChannels,
  createChannel,
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  markAsRead,
  searchUsers
} from "../controllers/chatController";

const router = express.Router();

// Rate limiting middleware for chat operations
const chatRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    message: "Too many chat requests from this IP, please try again later"
  },
  standardHeaders: true,
  legacyHeaders: false
});

const messageRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // Limit to 30 messages per minute
  message: {
    message: "Too many messages sent, please slow down"
  },
  standardHeaders: true,
  legacyHeaders: false
});

const channelCreationLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit to 10 channel creations per hour
  message: {
    message: "Too many channels created, please try again later"
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Apply rate limiting to all chat routes
router.use(chatRateLimit);

// Apply authentication to all routes
router.use(authMiddleware);

/**
 * @route   GET /api/chat/channels
 * @desc    Get user's channels
 * @access  Private
 */
router.get("/channels", getChannels);

/**
 * @route   POST /api/chat/channels
 * @desc    Create a new channel
 * @access  Private
 */
router.post(
  "/channels",
  channelCreationLimit,
  validate(createChannelSchema),
  createChannel
);

/**
 * @route   GET /api/chat/channels/:channelId/messages
 * @desc    Get messages for a channel
 * @access  Private
 */
router.get(
  "/channels/:channelId/messages",
  // Validate query parameters
  (req, res, next) => {
    const result = getMessagesSchema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({ 
        message: "Invalid query parameters", 
        errors: result.error.flatten() 
      });
    }
    req.query = result.data as any;
    next();
  },
  getMessages
);

/**
 * @route   POST /api/chat/channels/:channelId/messages
 * @desc    Send a message to a channel
 * @access  Private
 */
router.post(
  "/channels/:channelId/messages",
  messageRateLimit,
  validate(sendMessageSchema),
  sendMessage
);

/**
 * @route   PUT /api/chat/messages/:messageId
 * @desc    Edit a message
 * @access  Private
 */
router.put(
  "/messages/:messageId",
  validate(editMessageSchema),
  editMessage
);

/**
 * @route   DELETE /api/chat/messages/:messageId
 * @desc    Delete a message
 * @access  Private
 */
router.delete("/messages/:messageId", deleteMessage);

/**
 * @route   POST /api/chat/channels/:channelId/read
 * @desc    Mark channel messages as read
 * @access  Private
 */
router.post("/channels/:channelId/read", markAsRead);

/**
 * @route   GET /api/chat/users/search
 * @desc    Search users for channel invitations
 * @access  Private
 */
router.get(
  "/users/search",
  // Validate query parameters
  (req, res, next) => {
    const result = searchUsersSchema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({ 
        message: "Invalid search query", 
        errors: result.error.flatten() 
      });
    }
    req.query = result.data as any;
    next();
  },
  searchUsers
);

/**
 * @route   POST /api/chat/channels/:channelId/join
 * @desc    Join a channel
 * @access  Private
 */
router.post("/channels/:channelId/join", async (req, res) => {
  try {
    const user = (req as any).user;
    const { channelId } = req.params;
    
    if (!user?.company) {
      return res.status(403).json({ message: "User must belong to a company" });
    }

    const Channel = (await import("../models/Channel")).default;
    
    // Security: Verify channel exists and belongs to same company
    const channel = await Channel.findOne({
      _id: channelId,
      companyId: user.company,
      isArchived: false,
      type: { $ne: 'direct' } // Cannot join direct channels
    });

    if (!channel) {
      return res.status(404).json({ message: "Channel not found or cannot be joined" });
    }

    // Check if user is already a participant
    if (channel.participants.includes(user.id)) {
      return res.status(400).json({ message: "Already a member of this channel" });
    }

    // Security: Check role restrictions
    if (channel.allowedRoles && channel.allowedRoles.length > 0) {
      if (!channel.allowedRoles.includes(user.role)) {
        return res.status(403).json({ message: "Insufficient permissions to join this channel" });
      }
    }

    // Security: Check if channel is private
    if (channel.isPrivate) {
      return res.status(403).json({ message: "Cannot join private channel without invitation" });
    }

    // Add user to participants
    channel.participants.push(user.id);
    await channel.save();

    res.json({ message: "Successfully joined channel" });
  } catch (error) {
    console.error("Join channel error:", error);
    res.status(500).json({ message: "Failed to join channel" });
  }
});

/**
 * @route   POST /api/chat/channels/:channelId/leave
 * @desc    Leave a channel
 * @access  Private
 */
router.post("/channels/:channelId/leave", async (req, res) => {
  try {
    const user = (req as any).user;
    const { channelId } = req.params;
    
    if (!user?.company) {
      return res.status(403).json({ message: "User must belong to a company" });
    }

    const Channel = (await import("../models/Channel")).default;
    
    // Security: Verify channel exists and user is participant
    const channel = await Channel.findOne({
      _id: channelId,
      participants: user.id,
      companyId: user.company,
      type: { $ne: 'direct' } // Cannot leave direct channels
    });

    if (!channel) {
      return res.status(404).json({ message: "Channel not found or not a member" });
    }

    // Security: Prevent leaving if user is the only admin/creator
    if (channel.createdBy.equals(user.id) && channel.participants.length > 1) {
      // TODO: Implement admin transfer logic
      return res.status(400).json({ 
        message: "Cannot leave channel as creator. Transfer ownership first." 
      });
    }

    // Remove user from participants
    channel.participants = channel.participants.filter(
      (participantId: any) => !participantId.equals(user.id)
    );

    // If no participants left, archive the channel
    if (channel.participants.length === 0) {
      channel.isArchived = true;
    }

    await channel.save();

    res.json({ message: "Successfully left channel" });
  } catch (error) {
    console.error("Leave channel error:", error);
    res.status(500).json({ message: "Failed to leave channel" });
  }
});

/**
 * @route   GET /api/chat/channels/:channelId/users
 * @desc    Get users in a channel
 * @access  Private
 */
router.get("/channels/:channelId/users", async (req, res) => {
  try {
    const user = (req as any).user;
    const { channelId } = req.params;
    
    if (!user?.company) {
      return res.status(403).json({ message: "User must belong to a company" });
    }

    const Channel = (await import("../models/Channel")).default;
    
    // Security: Verify user has access to channel
    const channel = await Channel.findOne({
      _id: channelId,
      participants: user.id,
      companyId: user.company
    })
    .populate({
      path: 'participants',
      select: 'firstName lastName email avatarUrl chatStatus lastSeen role',
      match: { status: 'active' }
    })
    .lean();

    if (!channel) {
      return res.status(403).json({ message: "Channel not found or access denied" });
    }

    // Transform users for frontend
    const users = channel.participants.map((p: any) => ({
      id: p._id,
      name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email,
      email: p.email,
      avatarUrl: p.avatarUrl,
      status: p.chatStatus || 'offline',
      lastSeen: p.lastSeen,
      role: p.role
    }));

    res.json(users);
  } catch (error) {
    console.error("Get channel users error:", error);
    res.status(500).json({ message: "Failed to get channel users" });
  }
});

/**
 * @route   POST /api/chat/upload
 * @desc    Upload file for chat
 * @access  Private
 */
router.post("/upload", async (req, res) => {
  try {
    // TODO: Implement file upload using existing Cloudinary setup
    // This should integrate with your existing file upload middleware
    res.status(501).json({ message: "File upload not implemented yet" });
  } catch (error) {
    console.error("File upload error:", error);
    res.status(500).json({ message: "Failed to upload file" });
  }
});

export default router;
