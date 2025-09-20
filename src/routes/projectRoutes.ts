import express, { Request, Response, NextFunction, RequestHandler } from "express";
import {
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  getProjectTasks,
  addProjectMembers,
  removeProjectMember
} from "../controllers/projectController";
import { requireAuth } from "../middleware/authMiddleware";
import { requireCompanyAccess } from "../middleware/roleMiddleware";
import { validate } from "../middleware/validate";
import {
  createProjectSchema,
  updateProjectSchema,
  addProjectMembersSchema,
  projectQuerySchema,
  projectTaskQuerySchema
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

// GET /api/projects - Get all projects
router.get("/", validateQuery(projectQuerySchema), getAllProjects as RequestHandler);

// GET /api/projects/:id - Get a specific project with its tasks
router.get("/:id", getProjectById as RequestHandler);

// POST /api/projects - Create a new project
router.post("/", validate(createProjectSchema), createProject as RequestHandler);

// PUT /api/projects/:id - Update a project
router.put("/:id", validate(updateProjectSchema), updateProject as RequestHandler);

// DELETE /api/projects/:id - Delete a project
router.delete("/:id", deleteProject as RequestHandler);

// GET /api/projects/:id/tasks - Get all tasks for a specific project
router.get("/:id/tasks", validateQuery(projectTaskQuerySchema), getProjectTasks as RequestHandler);

// POST /api/projects/:id/members - Add members to a project
router.post("/:id/members", validate(addProjectMembersSchema), addProjectMembers as RequestHandler);

// DELETE /api/projects/:id/members/:userId - Remove a member from a project
router.delete("/:id/members/:userId", removeProjectMember as RequestHandler);

export default router;
