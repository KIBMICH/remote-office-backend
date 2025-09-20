import { z } from "zod";

// Task validation schemas
export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title must be less than 200 characters"),
  description: z.string().min(1, "Description is required").max(1000, "Description must be less than 1000 characters"),
  assigneeId: z.string().min(1, "Assignee ID is required"),
  dueDate: z.string().datetime("Invalid date format"),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  status: z.enum(["todo", "in_progress", "done"]).default("todo").optional(),
  projectId: z.string().optional(),
  tags: z.array(z.string().max(50)).max(10, "Maximum 10 tags allowed").optional()
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(1000).optional(),
  assigneeId: z.string().min(1).optional(),
  dueDate: z.string().datetime().optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  projectId: z.string().optional(),
  tags: z.array(z.string().max(50)).max(10).optional()
});

export const updateTaskStatusSchema = z.object({
  status: z.enum(["todo", "in_progress", "done"])
});

// Project validation schemas
export const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(200, "Project name must be less than 200 characters"),
  description: z.string().max(1000, "Description must be less than 1000 characters").optional(),
  dueDate: z.string().datetime("Invalid date format"),
  memberIds: z.array(z.string()).max(50, "Maximum 50 members allowed").optional()
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  dueDate: z.string().datetime().optional(),
  status: z.enum(["active", "completed", "on_hold", "cancelled"]).optional(),
  memberIds: z.array(z.string()).max(50).optional()
});

export const addProjectMembersSchema = z.object({
  memberIds: z.array(z.string().min(1)).min(1, "At least one member ID is required").max(50, "Maximum 50 members can be added at once")
});

// Query parameter validation schemas
export const taskQuerySchema = z.object({
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  assignee: z.string().optional(),
  project: z.string().optional(),
  page: z.string().transform(val => parseInt(val) || 1).optional(),
  limit: z.string().transform(val => Math.min(parseInt(val) || 10, 100)).optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "dueDate", "priority", "status"]).default("createdAt").optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc").optional()
});

export const projectQuerySchema = z.object({
  status: z.enum(["active", "completed", "on_hold", "cancelled"]).optional(),
  page: z.string().transform(val => parseInt(val) || 1).optional(),
  limit: z.string().transform(val => Math.min(parseInt(val) || 10, 100)).optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "dueDate", "name", "progress"]).default("createdAt").optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc").optional()
});

export const projectTaskQuerySchema = z.object({
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  assignee: z.string().optional(),
  priority: z.enum(["high", "medium", "low"]).optional()
});

export const myTasksQuerySchema = z.object({
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  page: z.string().transform(val => parseInt(val) || 1).optional(),
  limit: z.string().transform(val => Math.min(parseInt(val) || 10, 100)).optional()
});
