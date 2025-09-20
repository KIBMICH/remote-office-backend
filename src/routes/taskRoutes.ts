import express, { Request, Response, NextFunction, RequestHandler } from "express";
import {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  getMyTasks
} from "../controllers/taskController";
import { requireAuth } from "../middleware/authMiddleware";
import { requireCompanyAccess } from "../middleware/roleMiddleware";
import { validate } from "../middleware/validate";
import {
  createTaskSchema,
  updateTaskSchema,
  updateTaskStatusSchema,
  taskQuerySchema,
  myTasksQuerySchema
} from "../utils/validationSchemas";
import { ZodSchema } from "zod";

const router = express.Router();

// Middleware to validate query parameters
const validateQuery = (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    return res.status(400).json({ 
      message: "Invalid query parameters", 
      errors: result.error.flatten() 
    });
  }
  // Type assertion is safe here since we've validated the data
  (req as any).query = result.data;
  next();
};

// All routes require authentication and company access
router.use(requireAuth);
router.use(requireCompanyAccess);

// GET /api/tasks - Get all tasks with filtering and pagination
router.get("/", validateQuery(taskQuerySchema), getAllTasks as RequestHandler);

// GET /api/tasks/my-tasks - Get tasks assigned to the current user
router.get("/my-tasks", validateQuery(myTasksQuerySchema), getMyTasks as RequestHandler);

// GET /api/tasks/:id - Get a specific task by ID
router.get("/:id", getTaskById as RequestHandler);

// POST /api/tasks - Create a new task
router.post("/", validate(createTaskSchema), createTask as RequestHandler);

// PUT /api/tasks/:id - Update an existing task
router.put("/:id", validate(updateTaskSchema), updateTask as RequestHandler);

// PATCH /api/tasks/:id/status - Update only the task status
router.patch("/:id/status", validate(updateTaskStatusSchema), updateTaskStatus as RequestHandler);

// DELETE /api/tasks/:id - Delete a task
router.delete("/:id", deleteTask as RequestHandler);

export default router;
