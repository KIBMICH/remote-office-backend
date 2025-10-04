import { Server } from "socket.io";
import { 
  AuthenticatedSocket, 
  checkChannelAccess, 
  SocketRateLimiter,
  validateSocketData 
} from "../middleware/socketAuth";
import Channel from "../models/Channel";
import Message from "../models/Message";
import User from "../models/User";
import {
  socketJoinChannelSchema,
  socketSendMessageSchema,
  socketTypingSchema,
  SocketJoinChannelInput,
  SocketSendMessageInput,
  SocketTypingInput
} from "./chatValidation";

/**
 * Initialize Socket.IO event handlers with security measures
 */
export const initializeSocketEvents = (io: Server) => {
  
  io.on("connection", async (socket) => {
    const authSocket = socket as AuthenticatedSocket;
    console.log(`User ${authSocket.userId} connected from company ${authSocket.companyId}`);
    
    try {
      // Update user's online status and add socket ID
      await User.findByIdAndUpdate(authSocket.userId, {
        chatStatus: 'online',
        lastSeen: new Date(),
        $addToSet: { socketIds: authSocket.id }
      });

      // Join user to their company room for company-wide broadcasts
      authSocket.join(`company:${authSocket.companyId}`);

      // Auto-join user to their channels
      await autoJoinUserChannels(authSocket);

      // Broadcast user online status to company members
      authSocket.to(`company:${authSocket.companyId}`).emit('user_status_change', {
        userId: authSocket.userId,
        status: 'online',
        lastSeen: new Date()
      });

    } catch (error) {
      console.error("Connection setup error:", error);
      authSocket.emit('error', { message: 'Connection setup failed' });
    }

    /**
     * Handle joining a specific channel
     */
    authSocket.on('join_channel', async (data: unknown) => {
      try {
        // Rate limiting
        if (!SocketRateLimiter.checkLimit(authSocket.userId, 'join')) {
          authSocket.emit('error', { message: 'Too many join requests. Please slow down.' });
          return;
        }

        // Validate input
        const validData = validateSocketData<SocketJoinChannelInput>(
          data,
          (d): d is SocketJoinChannelInput => {
            const result = socketJoinChannelSchema.safeParse(d);
            return result.success;
          }
        );

        if (!validData) {
          authSocket.emit('error', { message: 'Invalid channel join data' });
          return;
        }

        const { channelId } = validData;

        // Security: Check channel access
        const hasAccess = await checkChannelAccess(authSocket, channelId);
        if (!hasAccess) {
          authSocket.emit('error', { message: 'Access denied to channel' });
          return;
        }

        // Join the channel room
        authSocket.join(channelId);
        
        // Notify channel members
        authSocket.to(channelId).emit('user_joined_channel', {
          channelId,
          userId: authSocket.userId,
          userName: `${authSocket.user.firstName || ''} ${authSocket.user.lastName || ''}`.trim() || authSocket.user.email
        });

        authSocket.emit('joined_channel', { channelId });

      } catch (error) {
        console.error("Join channel error:", error);
        authSocket.emit('error', { message: 'Failed to join channel' });
      }
    });

    /**
     * Handle leaving a channel
     */
    authSocket.on('leave_channel', async (data: unknown) => {
      try {
        const validData = validateSocketData<SocketJoinChannelInput>(
          data,
          (d): d is SocketJoinChannelInput => {
            const result = socketJoinChannelSchema.safeParse(d);
            return result.success;
          }
        );

        if (!validData) {
          authSocket.emit('error', { message: 'Invalid channel leave data' });
          return;
        }

        const { channelId } = validData;

        // Leave the channel room
        authSocket.leave(channelId);
        
        // Notify channel members
        authSocket.to(channelId).emit('user_left_channel', {
          channelId,
          userId: authSocket.userId,
          userName: `${authSocket.user.firstName || ''} ${authSocket.user.lastName || ''}`.trim() || authSocket.user.email
        });

        authSocket.emit('left_channel', { channelId });

      } catch (error) {
        console.error("Leave channel error:", error);
        authSocket.emit('error', { message: 'Failed to leave channel' });
      }
    });

    /**
     * Handle sending messages
     */
    authSocket.on('send_message', async (data: unknown) => {
      try {
        // Rate limiting
        if (!SocketRateLimiter.checkLimit(authSocket.userId, 'message')) {
          authSocket.emit('error', { message: 'Too many messages. Please slow down.' });
          return;
        }

        // Validate input
        const validData = validateSocketData<SocketSendMessageInput>(
          data,
          (d): d is SocketSendMessageInput => {
            const result = socketSendMessageSchema.safeParse(d);
            return result.success;
          }
        );

        if (!validData) {
          authSocket.emit('error', { message: 'Invalid message data' });
          return;
        }

        const { channelId, content, type, replyTo } = validData;

        // Security: Check channel access
        const hasAccess = await checkChannelAccess(authSocket, channelId);
        if (!hasAccess) {
          authSocket.emit('error', { message: 'Access denied to channel' });
          return;
        }

        // Security: Verify reply-to message if provided
        if (replyTo) {
          const replyMessage = await Message.findOne({
            _id: replyTo,
            channelId,
            companyId: authSocket.companyId,
            isDeleted: false
          }).lean();

          if (!replyMessage) {
            authSocket.emit('error', { message: 'Reply message not found' });
            return;
          }
        }

        // Create and save message
        const message = new Message({
          content,
          senderId: authSocket.userId,
          channelId,
          companyId: authSocket.companyId,
          type: type || 'text',
          replyTo
        });

        await message.save();

        // Update channel's last message and activity
        await Channel.findByIdAndUpdate(channelId, {
          lastMessage: message._id,
          lastActivity: new Date()
        });

        // Populate sender information
        await message.populate('senderId', 'firstName lastName email avatarUrl');

        // Transform message for broadcast
        const sender = message.senderId as any;
        const messageData = {
          id: message._id,
          content: message.content,
          senderId: sender._id,
          sender: {
            id: sender._id,
            name: `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || sender.email,
            email: sender.email,
            avatarUrl: sender.avatarUrl
          },
          timestamp: message.createdAt?.toISOString() || new Date().toISOString(),
          type: message.type,
          isEdited: message.isEdited,
          replyTo: message.replyTo
        };

        // Broadcast to all channel members
        io.to(channelId).emit('new_message', messageData);

        // Send confirmation to sender
        authSocket.emit('message_sent', { 
          tempId: (data as any)?.tempId, // For frontend optimistic updates
          message: messageData 
        });

      } catch (error) {
        console.error("Send message error:", error);
        authSocket.emit('error', { message: 'Failed to send message' });
      }
    });

    /**
     * Handle typing indicators
     */
    authSocket.on('typing_start', async (data: unknown) => {
      try {
        // Rate limiting
        if (!SocketRateLimiter.checkLimit(authSocket.userId, 'typing')) {
          return; // Silently ignore excessive typing events
        }

        const validData = validateSocketData<SocketTypingInput>(
          data,
          (d): d is SocketTypingInput => {
            const result = socketTypingSchema.safeParse(d);
            return result.success;
          }
        );

        if (!validData) return;

        const { channelId } = validData;

        // Security: Check channel access
        const hasAccess = await checkChannelAccess(authSocket, channelId);
        if (!hasAccess) return;

        // Broadcast typing indicator to other channel members
        authSocket.to(channelId).emit('user_typing', {
          channelId,
          userId: authSocket.userId,
          userName: `${authSocket.user.firstName || ''} ${authSocket.user.lastName || ''}`.trim() || authSocket.user.email
        });

      } catch (error) {
        console.error("Typing start error:", error);
      }
    });

    /**
     * Handle stop typing
     */
    authSocket.on('typing_stop', async (data: unknown) => {
      try {
        const validData = validateSocketData<SocketTypingInput>(
          data,
          (d): d is SocketTypingInput => {
            const result = socketTypingSchema.safeParse(d);
            return result.success;
          }
        );

        if (!validData) return;

        const { channelId } = validData;

        // Security: Check channel access
        const hasAccess = await checkChannelAccess(authSocket, channelId);
        if (!hasAccess) return;

        // Broadcast stop typing to other channel members
        authSocket.to(channelId).emit('user_stop_typing', {
          channelId,
          userId: authSocket.userId
        });

      } catch (error) {
        console.error("Typing stop error:", error);
      }
    });

    /**
     * Handle marking messages as read
     */
    authSocket.on('mark_as_read', async (data: unknown) => {
      try {
        const validData = validateSocketData<SocketTypingInput>(
          data,
          (d): d is SocketTypingInput => {
            const result = socketTypingSchema.safeParse(d);
            return result.success;
          }
        );

        if (!validData) return;

        const { channelId } = validData;

        // Security: Check channel access
        const hasAccess = await checkChannelAccess(authSocket, channelId);
        if (!hasAccess) return;

        // TODO: Implement read receipts logic
        
        // Broadcast read status to channel members
        authSocket.to(channelId).emit('messages_read', {
          channelId,
          userId: authSocket.userId,
          readAt: new Date()
        });

      } catch (error) {
        console.error("Mark as read error:", error);
      }
    });

    /**
     * Handle user status changes
     */
    authSocket.on('status_change', async (data: { status: 'online' | 'away' | 'busy' }) => {
      try {
        const { status } = data;
        
        if (!['online', 'away', 'busy'].includes(status)) {
          authSocket.emit('error', { message: 'Invalid status' });
          return;
        }

        // Update user status
        await User.findByIdAndUpdate(authSocket.userId, {
          chatStatus: status,
          lastSeen: new Date()
        });

        // Broadcast status change to company members
        authSocket.to(`company:${authSocket.companyId}`).emit('user_status_change', {
          userId: authSocket.userId,
          status,
          lastSeen: new Date()
        });

      } catch (error) {
        console.error("Status change error:", error);
        authSocket.emit('error', { message: 'Failed to update status' });
      }
    });

    /**
     * Handle disconnection
     */
    authSocket.on('disconnect', async (reason) => {
      console.log(`User ${authSocket.userId} disconnected: ${reason}`);
      
      try {
        // Remove socket ID from user
        await User.findByIdAndUpdate(authSocket.userId, {
          $pull: { socketIds: authSocket.id },
          lastSeen: new Date()
        });

        // Check if user has other active connections
        const user = await User.findById(authSocket.userId).select('socketIds').lean();
        
        if (!user || !user.socketIds || user.socketIds.length === 0) {
          // Set user offline if no active connections
          await User.findByIdAndUpdate(authSocket.userId, {
            chatStatus: 'offline'
          });

          // Broadcast offline status to company members
          authSocket.to(`company:${authSocket.companyId}`).emit('user_status_change', {
            userId: authSocket.userId,
            status: 'offline',
            lastSeen: new Date()
          });
        }

      } catch (error) {
        console.error("Disconnect cleanup error:", error);
      }
    });

    /**
     * Handle connection errors
     */
    authSocket.on('error', (error) => {
      console.error(`Socket error for user ${authSocket.userId}:`, error);
    });

  });
};

/**
 * Auto-join user to their channels on connection
 */
async function autoJoinUserChannels(socket: AuthenticatedSocket) {
  try {
    const channels = await Channel.find({
      participants: socket.userId,
      companyId: socket.companyId,
      isArchived: false
    }).select('_id').lean();

    for (const channel of channels) {
      socket.join(channel._id.toString());
    }

    console.log(`User ${socket.userId} auto-joined ${channels.length} channels`);
  } catch (error) {
    console.error("Auto-join channels error:", error);
  }
}
