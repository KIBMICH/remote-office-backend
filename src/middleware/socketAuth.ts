import jwt from "jsonwebtoken";
import { Socket } from "socket.io";
import User from "../models/User";
import { ExtendedError } from "socket.io/dist/namespace";

const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

// Extend Socket interface to include user data
export interface AuthenticatedSocket extends Socket {
  userId: string;
  user: {
    id: string;
    _id: string;
    email: string;
    role: string;
    company: string;
    firstName?: string;
    lastName?: string;
  };
  companyId: string;
}

/**
 * Socket.IO authentication middleware
 * Validates JWT token and attaches user data to socket
 */
export const socketAuthMiddleware = async (
  socket: Socket,
  next: (err?: ExtendedError) => void
) => {
  try {
    // Extract token from handshake auth or query
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    
    if (!token) {
      return next(new Error("Authentication token required"));
    }

    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      email: string;
      role?: string;
      company?: string;
    };

    if (!decoded.id) {
      return next(new Error("Invalid token payload"));
    }

    // Fetch user from database with security checks
    const user = await User.findById(decoded.id)
      .select("-password -socketIds") // Exclude sensitive fields
      .lean();

    if (!user) {
      return next(new Error("User not found"));
    }

    // Security: Check if user is active
    if (user.status !== "active") {
      return next(new Error("User account is inactive"));
    }

    // Security: Ensure user has a company (multi-tenant isolation)
    if (!user.company) {
      return next(new Error("User must belong to a company"));
    }

    // Attach user data to socket with type safety
    const authSocket = socket as AuthenticatedSocket;
    authSocket.userId = user._id.toString();
    authSocket.companyId = user.company.toString();
    authSocket.user = {
      id: user._id.toString(),
      _id: user._id.toString(),
      email: user.email,
      role: user.role,
      company: user.company.toString(),
      firstName: user.firstName,
      lastName: user.lastName
    };

    // Security: Rate limiting - track connection attempts
    const connectionKey = `socket_conn:${user._id}`;
    // Note: In production, implement Redis-based rate limiting here

    next();
  } catch (error) {
    console.error("Socket authentication error:", error);
    
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new Error("Invalid authentication token"));
    }
    
    if (error instanceof jwt.TokenExpiredError) {
      return next(new Error("Authentication token expired"));
    }
    
    return next(new Error("Authentication failed"));
  }
};

/**
 * Middleware to check if user can access a specific channel
 */
export const checkChannelAccess = async (
  socket: AuthenticatedSocket,
  channelId: string
): Promise<boolean> => {
  try {
    const Channel = (await import("../models/Channel")).default;
    
    // Security: Check if user is participant and channel belongs to same company
    const channel = await Channel.findOne({
      _id: channelId,
      participants: socket.userId,
      companyId: socket.companyId,
      isArchived: false
    }).lean();

    if (!channel) {
      return false;
    }

    // Additional role-based access control
    if (channel.allowedRoles && channel.allowedRoles.length > 0) {
      return channel.allowedRoles.includes(socket.user.role);
    }

    return true;
  } catch (error) {
    console.error("Channel access check error:", error);
    return false;
  }
};

/**
 * Rate limiting for socket events
 */
export class SocketRateLimiter {
  private static limits = new Map<string, number[]>();
  
  // Rate limits per minute
  private static readonly LIMITS = {
    message: 60,      // 60 messages per minute
    typing: 30,       // 30 typing events per minute
    join: 20,         // 20 channel joins per minute
    create: 5         // 5 channel creates per minute
  };

  static checkLimit(userId: string, action: keyof typeof this.LIMITS): boolean {
    const key = `${userId}:${action}`;
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window
    
    // Get existing timestamps for this user/action
    let timestamps = this.limits.get(key) || [];
    
    // Remove old timestamps outside the window
    timestamps = timestamps.filter(timestamp => timestamp > windowStart);
    
    // Check if limit exceeded
    if (timestamps.length >= this.LIMITS[action]) {
      return false;
    }
    
    // Add current timestamp
    timestamps.push(now);
    this.limits.set(key, timestamps);
    
    return true;
  }

  static cleanup(): void {
    // Cleanup old entries every 5 minutes
    const now = Date.now();
    const fiveMinutesAgo = now - 300000;
    
    for (const [key, timestamps] of this.limits.entries()) {
      const validTimestamps = timestamps.filter(timestamp => timestamp > fiveMinutesAgo);
      
      if (validTimestamps.length === 0) {
        this.limits.delete(key);
      } else {
        this.limits.set(key, validTimestamps);
      }
    }
  }
}

// Cleanup rate limiter every 5 minutes
setInterval(() => {
  SocketRateLimiter.cleanup();
}, 300000);

/**
 * Validate socket event data
 */
export const validateSocketData = <T>(
  data: unknown,
  validator: (data: unknown) => data is T
): T | null => {
  try {
    if (validator(data)) {
      return data;
    }
    return null;
  } catch (error) {
    console.error("Socket data validation error:", error);
    return null;
  }
};
