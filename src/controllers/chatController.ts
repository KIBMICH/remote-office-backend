import { RequestHandler } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import Channel from "../models/Channel";
import Message from "../models/Message";
import User from "../models/User";
import Project from "../models/Project";
import {
  CreateChannelInput,
  SendMessageInput,
  EditMessageInput,
  GetMessagesInput,
  UpdateChannelInput,
  SearchUsersInput
} from "../utils/chatValidation";

/**
 * Get user's channels with security filtering
 */
export const getChannels: RequestHandler = async (req, res) => {
  try {
    const user = (req as AuthRequest).user;
    
    if (!user?.company) {
      return res.status(403).json({ message: "User must belong to a company" });
    }

    // Security: Only get channels where user is participant and belongs to same company
    const channels = await Channel.find({
      participants: user.id,
      companyId: user.company,
      isArchived: false
    })
    .populate({
      path: 'participants',
      select: 'firstName lastName email avatarUrl chatStatus lastSeen',
      match: { status: 'active' } // Only active users
    })
    .populate({
      path: 'lastMessage',
      select: 'content senderId createdAt type isDeleted',
      populate: {
        path: 'senderId',
        select: 'firstName lastName'
      }
    })
    .populate('projectId', 'name status')
    .sort({ lastActivity: -1 })
    .lean();

    // Transform data for frontend compatibility
    const transformedChannels = channels.map(channel => ({
      id: channel._id,
      name: channel.name,
      type: channel.type,
      participants: channel.participants.map((p: any) => ({
        id: p._id,
        name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email,
        email: p.email,
        avatarUrl: p.avatarUrl,
        status: p.chatStatus || 'offline'
      })),
      lastMessage: channel.lastMessage ? {
        id: (channel.lastMessage as any)._id,
        content: (channel.lastMessage as any).isDeleted 
          ? "[This message has been deleted]" 
          : (channel.lastMessage as any).content,
        senderId: (channel.lastMessage as any).senderId._id,
        sender: {
          name: `${(channel.lastMessage as any).senderId.firstName || ''} ${(channel.lastMessage as any).senderId.lastName || ''}`.trim()
        },
        timestamp: (channel.lastMessage as any).createdAt?.toISOString(),
        type: (channel.lastMessage as any).type
      } : null,
      unreadCount: 0, // TODO: Implement unread count logic
      isOnline: channel.participants.some((p: any) => p.chatStatus === 'online'),
      projectId: channel.projectId?._id
    }));

    res.json(transformedChannels);
  } catch (error) {
    console.error("Get channels error:", error);
    res.status(500).json({ message: "Failed to fetch channels" });
  }
};

/**
 * Create a new channel with security validation
 */
export const createChannel: RequestHandler = async (req, res) => {
  try {
    const user = (req as AuthRequest).user;
    const { name, type, participantIds, projectId, isPrivate, allowedRoles }: CreateChannelInput = req.body;
    
    if (!user?.company) {
      return res.status(403).json({ message: "User must belong to a company" });
    }

    // Security: Verify all participants belong to the same company
    const participants = await User.find({
      _id: { $in: participantIds },
      company: user.company,
      status: 'active'
    }).select('_id role').lean();

    if (participants.length !== participantIds.length) {
      return res.status(400).json({ 
        message: "Some participants are invalid or don't belong to your company" 
      });
    }

    // Security: If project channel, verify project exists and user has access
    if (type === 'project' && projectId) {
      const project = await Project.findOne({
        _id: projectId,
        company: user.company,
        $or: [
          { members: user.id },
          { createdBy: user.id }
        ]
      }).lean();

      if (!project) {
        return res.status(403).json({ 
          message: "Project not found or access denied" 
        });
      }
    }

    // Security: Role-based channel creation restrictions
    if (type === 'group' && user.role === 'member') {
      return res.status(403).json({ 
        message: "Members cannot create group channels" 
      });
    }

    // Check for existing direct channel
    if (type === 'direct') {
      const existingChannel = await Channel.findOne({
        type: 'direct',
        companyId: user.company,
        participants: { 
          $all: [user.id, participantIds[0]],
          $size: 2
        }
      }).lean();

      if (existingChannel) {
        return res.status(400).json({ 
          message: "Direct channel already exists with this user" 
        });
      }
    }

    // Create channel with unique participants (avoid duplicates)
    const uniqueParticipants = Array.from(new Set([user.id, ...participantIds]));
    
    const channel = new Channel({
      name,
      type,
      participants: uniqueParticipants,
      projectId: type === 'project' ? projectId : undefined,
      companyId: user.company,
      createdBy: user.id,
      isPrivate: isPrivate || false,
      allowedRoles: allowedRoles || []
    });

    await channel.save();
    
    // Populate for response
    await channel.populate([
      {
        path: 'participants',
        select: 'firstName lastName email avatarUrl chatStatus'
      },
      {
        path: 'projectId',
        select: 'name status'
      }
    ]);

    // Transform for frontend
    const transformedChannel = {
      id: channel._id,
      name: channel.name,
      type: channel.type,
      participants: channel.participants.map((p: any) => ({
        id: p._id,
        name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email,
        email: p.email,
        avatarUrl: p.avatarUrl,
        status: p.chatStatus || 'offline'
      })),
      unreadCount: 0,
      projectId: channel.projectId?._id
    };

    res.status(201).json(transformedChannel);
  } catch (error) {
    console.error("Create channel error:", error);
    res.status(500).json({ message: "Failed to create channel" });
  }
};

/**
 * Get messages for a channel with security validation
 */
export const getMessages: RequestHandler = async (req, res) => {
  try {
    const user = (req as AuthRequest).user;
    const { channelId } = req.params;
    const { limit, offset, before }: GetMessagesInput = req.query as any;
    
    if (!user?.company) {
      return res.status(403).json({ message: "User must belong to a company" });
    }

    // Security: Verify user has access to channel
    const channel = await Channel.findOne({
      _id: channelId,
      participants: user.id,
      companyId: user.company,
      isArchived: false
    }).lean();

    if (!channel) {
      return res.status(403).json({ message: "Channel not found or access denied" });
    }

    // Build query with security filters
    const query: any = {
      channelId,
      companyId: user.company,
      isDeleted: false
    };

    if (before) {
      query._id = { $lt: before };
    }

    const messages = await Message.find(query)
      .populate('senderId', 'firstName lastName email avatarUrl')
      .populate('replyTo', 'content senderId createdAt')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip(Number(offset))
      .lean();

    // Transform messages for frontend
    const transformedMessages = messages.reverse().map((message: any) => ({
      id: message._id,
      content: message.isDeleted ? "[This message has been deleted]" : message.content,
      senderId: message.senderId._id,
      sender: {
        id: message.senderId._id,
        name: `${message.senderId.firstName || ''} ${message.senderId.lastName || ''}`.trim() || message.senderId.email,
        email: message.senderId.email,
        avatarUrl: message.senderId.avatarUrl
      },
      timestamp: message.createdAt?.toISOString(),
      type: message.type,
      fileUrl: message.fileUrl,
      fileName: message.fileName,
      isEdited: message.isEdited,
      replyTo: message.replyTo?._id
    }));

    res.json(transformedMessages);
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({ message: "Failed to fetch messages" });
  }
};

/**
 * Send a message with security validation
 */
export const sendMessage: RequestHandler = async (req, res) => {
  try {
    const user = (req as AuthRequest).user;
    const { channelId } = req.params;
    const { content, type, replyTo }: SendMessageInput = req.body;
    
    if (!user?.company) {
      return res.status(403).json({ message: "User must belong to a company" });
    }

    // Security: Verify user has access to channel
    const channel = await Channel.findOne({
      _id: channelId,
      participants: user.id,
      companyId: user.company,
      isArchived: false
    }).lean();

    if (!channel) {
      return res.status(403).json({ message: "Channel not found or access denied" });
    }

    // Security: If replying to a message, verify it exists in the same channel
    if (replyTo) {
      const replyMessage = await Message.findOne({
        _id: replyTo,
        channelId,
        companyId: user.company,
        isDeleted: false
      }).lean();

      if (!replyMessage) {
        return res.status(400).json({ message: "Reply message not found" });
      }
    }

    // Create message
    const message = new Message({
      content,
      senderId: user.id,
      channelId,
      companyId: user.company,
      type: type || 'text',
      replyTo
    });

    await message.save();

    // Update channel's last message and activity
    await Channel.findByIdAndUpdate(channelId, {
      lastMessage: message._id,
      lastActivity: new Date()
    });

    // Populate for response
    await message.populate('senderId', 'firstName lastName email avatarUrl');

    // Transform for frontend
    const sender = message.senderId as any;
    const transformedMessage = {
      id: message._id,
      content: message.content,
      senderId: sender._id,
      sender: {
        id: sender._id,
        name: `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || sender.email,
        email: sender.email,
        avatarUrl: sender.avatarUrl
      },
      timestamp: message.createdAt?.toISOString(),
      type: message.type,
      isEdited: message.isEdited,
      replyTo: message.replyTo
    };

    res.status(201).json(transformedMessage);
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ message: "Failed to send message" });
  }
};

/**
 * Edit a message with security validation
 */
export const editMessage: RequestHandler = async (req, res) => {
  try {
    const user = (req as AuthRequest).user;
    const { messageId } = req.params;
    const { content }: EditMessageInput = req.body;
    
    if (!user?.company) {
      return res.status(403).json({ message: "User must belong to a company" });
    }

    // Security: Only allow editing own messages
    const message = await Message.findOne({
      _id: messageId,
      senderId: user.id,
      companyId: user.company,
      isDeleted: false,
      type: 'text' // Only text messages can be edited
    });

    if (!message) {
      return res.status(404).json({ message: "Message not found or cannot be edited" });
    }

    // Security: Prevent editing old messages (24 hour limit)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (message.createdAt < twentyFourHoursAgo) {
      return res.status(403).json({ message: "Cannot edit messages older than 24 hours" });
    }

    // Update message
    message.content = content;
    message.isEdited = true;
    message.editedAt = new Date();
    
    await message.save();
    await message.populate('senderId', 'firstName lastName email avatarUrl');

    // Transform for response
    const sender = message.senderId as any;
    const transformedMessage = {
      id: message._id,
      content: message.content,
      senderId: sender._id,
      sender: {
        id: sender._id,
        name: `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || sender.email,
        email: sender.email,
        avatarUrl: sender.avatarUrl
      },
      timestamp: message.createdAt?.toISOString(),
      type: message.type,
      isEdited: message.isEdited,
      editedAt: message.editedAt?.toISOString()
    };

    res.json(transformedMessage);
  } catch (error) {
    console.error("Edit message error:", error);
    res.status(500).json({ message: "Failed to edit message" });
  }
};

/**
 * Delete a message with security validation
 */
export const deleteMessage: RequestHandler = async (req, res) => {
  try {
    const user = (req as AuthRequest).user;
    const { messageId } = req.params;
    
    if (!user?.company) {
      return res.status(403).json({ message: "User must belong to a company" });
    }

    // Security: Allow deletion by sender or company admin
    const query: any = {
      _id: messageId,
      companyId: user.company,
      isDeleted: false
    };

    if (user.role !== 'company_admin' && user.role !== 'superadmin') {
      query.senderId = user.id;
    }

    const message = await Message.findOne(query);

    if (!message) {
      return res.status(404).json({ message: "Message not found or cannot be deleted" });
    }

    // Soft delete
    message.isDeleted = true;
    message.deletedAt = new Date();
    message.deletedBy = user.id as any;
    
    await message.save();

    res.json({ message: "Message deleted successfully" });
  } catch (error) {
    console.error("Delete message error:", error);
    res.status(500).json({ message: "Failed to delete message" });
  }
};

/**
 * Mark channel messages as read
 */
export const markAsRead: RequestHandler = async (req, res) => {
  try {
    const user = (req as AuthRequest).user;
    const { channelId } = req.params;
    
    if (!user?.company) {
      return res.status(403).json({ message: "User must belong to a company" });
    }

    // Security: Verify user has access to channel
    const channel = await Channel.findOne({
      _id: channelId,
      participants: user.id,
      companyId: user.company
    }).lean();

    if (!channel) {
      return res.status(403).json({ message: "Channel not found or access denied" });
    }

    // TODO: Implement read receipts logic here
    // For now, just return success
    
    res.json({ message: "Messages marked as read" });
  } catch (error) {
    console.error("Mark as read error:", error);
    res.status(500).json({ message: "Failed to mark messages as read" });
  }
};

/**
 * Search users for channel invitations
 */
export const searchUsers: RequestHandler = async (req, res) => {
  try {
    const user = (req as AuthRequest).user;
    const { q }: SearchUsersInput = req.query as any;
    
    if (!user?.company) {
      return res.status(403).json({ message: "User must belong to a company" });
    }

    // Security: Only search within same company
    const users = await User.find({
      company: user.company,
      status: 'active',
      _id: { $ne: user.id }, // Exclude current user
      $or: [
        { firstName: { $regex: q, $options: 'i' } },
        { lastName: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } }
      ]
    })
    .select('firstName lastName email avatarUrl role')
    .limit(20) // Limit results to prevent abuse
    .lean();

    // Transform for frontend
    const transformedUsers = users.map(u => ({
      id: u._id,
      name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
      email: u.email,
      avatarUrl: u.avatarUrl,
      role: u.role
    }));

    res.json(transformedUsers);
  } catch (error) {
    console.error("Search users error:", error);
    res.status(500).json({ message: "Failed to search users" });
  }
};
