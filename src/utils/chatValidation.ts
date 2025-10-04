import { z } from "zod";

// Security: Comprehensive validation schemas for chat functionality

export const createChannelSchema = z.object({
  name: z.string()
    .min(1, "Channel name is required")
    .max(100, "Channel name cannot exceed 100 characters")
    .regex(/^[a-zA-Z0-9\s\-_#]+$/, "Channel name contains invalid characters")
    .trim(),
  type: z.enum(["direct", "group", "project"]),
  participantIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid participant ID"))
    .min(1, "At least one participant is required")
    .max(99, "Cannot have more than 99 participants") // Excluding creator
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Duplicate participant IDs are not allowed"
    }),
  projectId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid project ID")
    .optional(),
  isPrivate: z.boolean().default(false),
  allowedRoles: z.array(z.enum(["superadmin", "company_admin", "employee", "member"]))
    .optional()
}).refine((data) => {
  // If type is project, projectId is required
  return data.type !== "project" || data.projectId;
}, {
  message: "Project ID is required for project channels",
  path: ["projectId"]
}).refine((data) => {
  // Direct channels must have exactly 1 participant (excluding creator)
  return data.type !== "direct" || data.participantIds.length === 1;
}, {
  message: "Direct channels must have exactly one other participant",
  path: ["participantIds"]
});

export const sendMessageSchema = z.object({
  content: z.string()
    .min(1, "Message content is required")
    .max(4000, "Message content cannot exceed 4000 characters")
    .refine((content) => {
      // Security: Basic XSS prevention
      return !/<script|<iframe|javascript:|data:/i.test(content);
    }, {
      message: "Message content contains potentially harmful content"
    })
    .trim(),
  type: z.enum(["text", "file", "image"]).default("text"),
  replyTo: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid reply message ID")
    .optional()
});

export const editMessageSchema = z.object({
  content: z.string()
    .min(1, "Message content is required")
    .max(4000, "Message content cannot exceed 4000 characters")
    .refine((content) => {
      // Security: Basic XSS prevention
      return !/<script|<iframe|javascript:|data:/i.test(content);
    }, {
      message: "Message content contains potentially harmful content"
    })
    .trim()
});

export const getMessagesSchema = z.object({
  limit: z.preprocess(
    (val) => val || "50",
    z.string()
      .regex(/^\d+$/, "Limit must be a number")
      .transform(Number)
      .refine((num) => num >= 1 && num <= 100, {
        message: "Limit must be between 1 and 100"
      })
  ),
  offset: z.preprocess(
    (val) => val || "0",
    z.string()
      .regex(/^\d+$/, "Offset must be a number")
      .transform(Number)
      .refine((num) => num >= 0, {
        message: "Offset must be non-negative"
      })
  ),
  before: z.preprocess(
    (val) => val === "" ? undefined : val,
    z.string()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid message ID")
      .optional()
  )
});

export const joinChannelSchema = z.object({
  channelId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid channel ID")
});

export const leaveChannelSchema = z.object({
  channelId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid channel ID")
});

export const markAsReadSchema = z.object({
  channelId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid channel ID")
});

export const searchUsersSchema = z.object({
  q: z.string()
    .min(1, "Search query is required")
    .max(100, "Search query cannot exceed 100 characters")
    .refine((query) => {
      // Security: Prevent injection attacks in search
      return !/[<>'"\\]/.test(query);
    }, {
      message: "Search query contains invalid characters"
    })
    .trim()
});

export const updateChannelSchema = z.object({
  name: z.string()
    .min(1, "Channel name is required")
    .max(100, "Channel name cannot exceed 100 characters")
    .regex(/^[a-zA-Z0-9\s\-_#]+$/, "Channel name contains invalid characters")
    .trim()
    .optional(),
  isArchived: z.boolean().optional(),
  allowedRoles: z.array(z.enum(["superadmin", "company_admin", "employee", "member"]))
    .optional()
});

export const fileUploadSchema = z.object({
  channelId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid channel ID")
});

// Socket event validation schemas
export const socketJoinChannelSchema = z.object({
  channelId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid channel ID")
});

export const socketSendMessageSchema = z.object({
  channelId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid channel ID"),
  content: z.string()
    .min(1, "Message content is required")
    .max(4000, "Message content cannot exceed 4000 characters")
    .refine((content) => {
      return !/<script|<iframe|javascript:|data:/i.test(content);
    }, {
      message: "Message content contains potentially harmful content"
    })
    .trim(),
  type: z.enum(["text", "file", "image"]).default("text"),
  replyTo: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid reply message ID")
    .optional()
});

export const socketTypingSchema = z.object({
  channelId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid channel ID")
});

// Rate limiting schemas
export const rateLimitSchema = z.object({
  action: z.enum(["message", "typing", "join", "create"]),
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid user ID"),
  timestamp: z.number()
});

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type EditMessageInput = z.infer<typeof editMessageSchema>;
export type GetMessagesInput = z.infer<typeof getMessagesSchema>;
export type JoinChannelInput = z.infer<typeof joinChannelSchema>;
export type LeaveChannelInput = z.infer<typeof leaveChannelSchema>;
export type MarkAsReadInput = z.infer<typeof markAsReadSchema>;
export type SearchUsersInput = z.infer<typeof searchUsersSchema>;
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;
export type FileUploadInput = z.infer<typeof fileUploadSchema>;
export type SocketJoinChannelInput = z.infer<typeof socketJoinChannelSchema>;
export type SocketSendMessageInput = z.infer<typeof socketSendMessageSchema>;
export type SocketTypingInput = z.infer<typeof socketTypingSchema>;
