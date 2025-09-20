import { Response } from "express";
import Task from "../models/Task";
import Project from "../models/Project";
import User from "../models/User";
import { AuthRequest } from "../middleware/authMiddleware";

/**
 * Dashboard Controller
 * Handles analytics, statistics, and dashboard-related operations
 */

/**
 * Get dashboard statistics
 * @route GET /api/dashboard/stats
 * @access Private - All authenticated users
 */
export const getDashboardStats = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const companyFilter = { company: user.company };

    // Get task statistics
    const [
      totalTasks,
      completedTasks,
      inProgressTasks,
      todoTasks,
      overdueTasks,
      totalProjects,
      activeProjects,
      completedProjects
    ] = await Promise.all([
      Task.countDocuments(companyFilter),
      Task.countDocuments({ ...companyFilter, status: "done" }),
      Task.countDocuments({ ...companyFilter, status: "in_progress" }),
      Task.countDocuments({ ...companyFilter, status: "todo" }),
      Task.countDocuments({
        ...companyFilter,
        dueDate: { $lt: new Date() },
        status: { $ne: "done" }
      }),
      Project.countDocuments(companyFilter),
      Project.countDocuments({ ...companyFilter, status: "active" }),
      Project.countDocuments({ ...companyFilter, status: "completed" })
    ]);

    // Calculate completion rate
    const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const projectCompletionRate = totalProjects > 0 ? Math.round((completedProjects / totalProjects) * 100) : 0;

    // Get recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentTasks = await Task.countDocuments({
      ...companyFilter,
      createdAt: { $gte: sevenDaysAgo }
    });

    const recentProjects = await Project.countDocuments({
      ...companyFilter,
      createdAt: { $gte: sevenDaysAgo }
    });

    res.json({
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        inProgress: inProgressTasks,
        todo: todoTasks,
        overdue: overdueTasks,
        completionRate: taskCompletionRate,
        recentlyCreated: recentTasks
      },
      projects: {
        total: totalProjects,
        active: activeProjects,
        completed: completedProjects,
        completionRate: projectCompletionRate,
        recentlyCreated: recentProjects
      }
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Get active projects with progress
 * @route GET /api/dashboard/active-projects
 * @access Private - All authenticated users
 */
export const getActiveProjects = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const projects = await Project.find({
      company: user.company,
      status: "active"
    })
      .sort({ updatedAt: -1 })
      .limit(10)
      .populate("members", "name avatarUrl")
      .populate("createdBy", "name")
      .populate({
        path: "tasks",
        select: "status"
      });

    // Calculate actual progress for each project
    const projectsWithProgress = projects.map(project => {
      const totalTasks = project.tasks.length;
      const completedTasks = project.tasks.filter((task: any) => task.status === "done").length;
      const calculatedProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      return {
        ...project.toObject(),
        calculatedProgress,
        taskStats: {
          total: totalTasks,
          completed: completedTasks,
          remaining: totalTasks - completedTasks
        }
      };
    });

    res.json({ projects: projectsWithProgress });
  } catch (error) {
    console.error("Error fetching active projects:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Get team members for assignment
 * @route GET /api/dashboard/team-members
 * @access Private - Company Admin/Employee
 */
export const getTeamMembers = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const users = await User.find({
      company: user.company,
      status: "active"
    })
      .select("name email avatarUrl jobTitle role")
      .sort({ name: 1 });

    res.json({ users });
  } catch (error) {
    console.error("Error fetching team members:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Get task analytics
 * @route GET /api/dashboard/task-analytics
 * @access Private - All authenticated users
 */
export const getTaskAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const companyFilter = { company: user.company };

    // Get tasks by priority
    const [highPriorityTasks, mediumPriorityTasks, lowPriorityTasks] = await Promise.all([
      Task.countDocuments({ ...companyFilter, priority: "high" }),
      Task.countDocuments({ ...companyFilter, priority: "medium" }),
      Task.countDocuments({ ...companyFilter, priority: "low" })
    ]);

    // Get tasks by status over time (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const tasksOverTime = await Task.aggregate([
      {
        $match: {
          company: user.company,
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            status: "$status"
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.date": 1 }
      }
    ]);

    // Get top assignees by task count
    const topAssignees = await Task.aggregate([
      {
        $match: companyFilter
      },
      {
        $group: {
          _id: "$assignee.id",
          name: { $first: "$assignee.name" },
          avatarUrl: { $first: "$assignee.avatarUrl" },
          totalTasks: { $sum: 1 },
          completedTasks: {
            $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] }
          }
        }
      },
      {
        $addFields: {
          completionRate: {
            $cond: [
              { $gt: ["$totalTasks", 0] },
              { $multiply: [{ $divide: ["$completedTasks", "$totalTasks"] }, 100] },
              0
            ]
          }
        }
      },
      {
        $sort: { totalTasks: -1 }
      },
      {
        $limit: 10
      }
    ]);

    res.json({
      priorityDistribution: {
        high: highPriorityTasks,
        medium: mediumPriorityTasks,
        low: lowPriorityTasks
      },
      tasksOverTime,
      topAssignees
    });
  } catch (error) {
    console.error("Error fetching task analytics:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Get project analytics
 * @route GET /api/dashboard/project-analytics
 * @access Private - All authenticated users
 */
export const getProjectAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const companyFilter = { company: user.company };

    // Get projects by status
    const [activeProjects, completedProjects, onHoldProjects, cancelledProjects] = await Promise.all([
      Project.countDocuments({ ...companyFilter, status: "active" }),
      Project.countDocuments({ ...companyFilter, status: "completed" }),
      Project.countDocuments({ ...companyFilter, status: "on_hold" }),
      Project.countDocuments({ ...companyFilter, status: "cancelled" })
    ]);

    // Get average project progress
    const projectProgressStats = await Project.aggregate([
      {
        $match: { ...companyFilter, status: "active" }
      },
      {
        $group: {
          _id: null,
          averageProgress: { $avg: "$progress" },
          totalProjects: { $sum: 1 }
        }
      }
    ]);

    // Get projects nearing deadline (next 7 days)
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    const projectsNearingDeadline = await Project.countDocuments({
      ...companyFilter,
      status: "active",
      dueDate: { $lte: nextWeek, $gte: new Date() }
    });

    // Get overdue projects
    const overdueProjects = await Project.countDocuments({
      ...companyFilter,
      status: "active",
      dueDate: { $lt: new Date() }
    });

    res.json({
      statusDistribution: {
        active: activeProjects,
        completed: completedProjects,
        onHold: onHoldProjects,
        cancelled: cancelledProjects
      },
      averageProgress: projectProgressStats[0]?.averageProgress || 0,
      projectsNearingDeadline,
      overdueProjects
    });
  } catch (error) {
    console.error("Error fetching project analytics:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
