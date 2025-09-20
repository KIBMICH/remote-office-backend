import express, { RequestHandler } from "express";
import {
  getDashboardStats,
  getActiveProjects,
  getTeamMembers,
  getTaskAnalytics,
  getProjectAnalytics
} from "../controllers/dashboardController";
import { requireAuth } from "../middleware/authMiddleware";
import { requireCompanyAccess } from "../middleware/roleMiddleware";

const router = express.Router();

// All routes require authentication and company access
router.use(requireAuth);
router.use(requireCompanyAccess);

// GET /api/dashboard/stats - Get dashboard statistics
router.get("/stats", getDashboardStats as RequestHandler);

// GET /api/dashboard/active-projects - Get active projects with progress
router.get("/active-projects", getActiveProjects as RequestHandler);

// GET /api/dashboard/task-analytics - Get task analytics
router.get("/task-analytics", getTaskAnalytics as RequestHandler);

// GET /api/dashboard/project-analytics - Get project analytics
router.get("/project-analytics", getProjectAnalytics as RequestHandler);

// GET /api/dashboard/team-members - Get all team members for assignment
router.get("/team-members", getTeamMembers as RequestHandler);

export default router;
