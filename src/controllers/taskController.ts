import { Response } from "express";
import Task from "../models/Task";
import Project from "../models/Project";
import User from "../models/User";
import { AuthRequest } from "../middleware/authMiddleware";

/**
 * Task Controller
 * Handles all task-related operations including CRUD, status updates, and user task filtering
 */

/**
 * Get all tasks with filtering and pagination
 * @route GET /api/tasks
 * @access Private - Company Admin/Employee
 */
export const getAllTasks = async (req: AuthRequest, res: Response) => {
  try {
    const {
      status,
      priority,
      assignee,
      project,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    // Build filter object
    const filter: any = { company: user.company };

    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (assignee) filter["assignee.id"] = assignee;
    if (project) filter["project.id"] = project;

    // Calculate pagination
    const skip = (Number(page) - 1) * Number(limit);

    // Build sort object
    const sort: any = {};
    sort[sortBy as string] = sortOrder === "asc" ? 1 : -1;

    // Execute query
    const tasks = await Task.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(Number(limit))
      .populate("assignee.id", "name email avatarUrl")
      .populate("project.id", "name")
      .populate("createdBy", "name email");

    const total = await Task.countDocuments(filter);

    res.json({
      tasks,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit))
    });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Get a specific task by ID
 * @route GET /api/tasks/:id
 * @access Private - Company Admin/Employee
 */
export const getTaskById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const task = await Task.findOne({ _id: id, company: user.company })
      .populate("assignee.id", "name email avatarUrl")
      .populate("project.id", "name description")
      .populate("createdBy", "name email");

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.json(task);
  } catch (error) {
    console.error("Error fetching task:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Create a new task
 * @route POST /api/tasks
 * @access Private - Company Admin only
 */
export const createTask = async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, assigneeId, dueDate, priority, status, projectId, tags } = req.body;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    // Check if user has permission to create tasks (company_admin or higher)
    if (!user.role || !["superadmin", "company_admin"].includes(user.role)) {
      return res.status(403).json({ message: "Insufficient permissions to create tasks" });
    }

    // Verify assignee exists and belongs to the same company
    const assignee = await User.findOne({ _id: assigneeId, company: user.company });
    if (!assignee) {
      return res.status(400).json({ message: "Assignee not found or not in the same company" });
    }

    // Prepare task data
    const taskData: any = {
      title,
      description,
      assignee: {
        id: assignee._id,
        name: assignee.name,
        avatarUrl: assignee.avatarUrl
      },
      dueDate: new Date(dueDate),
      priority: priority || "medium",
      status: status || "todo",
      tags: tags || [],
      createdBy: user._id,
      company: user.company
    };

    // If project is specified, verify it exists and add project info
    if (projectId) {
      const project = await Project.findOne({ _id: projectId, company: user.company });
      if (!project) {
        return res.status(400).json({ message: "Project not found or not in the same company" });
      }
      taskData.project = {
        id: project._id,
        name: project.name
      };
    }

    const task = new Task(taskData);
    await task.save();

    // If task is assigned to a project, add it to the project's tasks array
    if (projectId) {
      await Project.findByIdAndUpdate(projectId, {
        $addToSet: { tasks: task._id }
      });
    }

    // Populate the response
    await task.populate("assignee.id", "name email avatarUrl");
    await task.populate("project.id", "name");
    await task.populate("createdBy", "name email");

    res.status(201).json(task);
  } catch (error) {
    console.error("Error creating task:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Update an existing task
 * @route PUT /api/tasks/:id
 * @access Private - Company Admin/Task Creator
 */
export const updateTask = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    // Find the task
    const task = await Task.findOne({ _id: id, company: user.company });
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Check permissions - only company admin or task creator can update
    if ((!user.role || !["superadmin", "company_admin"].includes(user.role)) && task.createdBy.toString() !== user._id.toString()) {
      return res.status(403).json({ message: "Insufficient permissions to update this task" });
    }

    // Handle assignee update
    if (updates.assigneeId) {
      const assignee = await User.findOne({ _id: updates.assigneeId, company: user.company });
      if (!assignee) {
        return res.status(400).json({ message: "Assignee not found or not in the same company" });
      }
      updates.assignee = {
        id: assignee._id,
        name: assignee.name,
        avatarUrl: assignee.avatarUrl
      };
      delete updates.assigneeId;
    }

    // Handle project update
    if (updates.projectId) {
      const project = await Project.findOne({ _id: updates.projectId, company: user.company });
      if (!project) {
        return res.status(400).json({ message: "Project not found or not in the same company" });
      }
      
      // Remove task from old project if it exists
      if (task.project?.id) {
        await Project.findByIdAndUpdate(task.project.id, {
          $pull: { tasks: task._id }
        });
      }
      
      // Add task to new project
      await Project.findByIdAndUpdate(updates.projectId, {
        $addToSet: { tasks: task._id }
      });
      
      updates.project = {
        id: project._id,
        name: project.name
      };
      delete updates.projectId;
    }

    // Convert dueDate string to Date if provided
    if (updates.dueDate) {
      updates.dueDate = new Date(updates.dueDate);
    }

    const updatedTask = await Task.findByIdAndUpdate(id, updates, { new: true })
      .populate("assignee.id", "name email avatarUrl")
      .populate("project.id", "name")
      .populate("createdBy", "name email");

    res.json(updatedTask);
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Update only task status
 * @route PATCH /api/tasks/:id/status
 * @access Private - Company Admin/Task Creator/Assignee
 */
export const updateTaskStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const task = await Task.findOne({ _id: id, company: user.company });
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Allow assignee to update status, or company admin/creator
    const canUpdate = (user.role && ["superadmin", "company_admin"].includes(user.role)) ||
                     task.createdBy.toString() === user._id.toString() ||
                     task.assignee.id.toString() === user._id.toString();

    if (!canUpdate) {
      return res.status(403).json({ message: "Insufficient permissions to update task status" });
    }

    const updatedTask = await Task.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    )
      .populate("assignee.id", "name email avatarUrl")
      .populate("project.id", "name")
      .populate("createdBy", "name email");

    res.json(updatedTask);
  } catch (error) {
    console.error("Error updating task status:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Delete a task
 * @route DELETE /api/tasks/:id
 * @access Private - Company Admin/Task Creator
 */
export const deleteTask = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const task = await Task.findOne({ _id: id, company: user.company });
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Check permissions - only company admin or task creator can delete
    if ((!user.role || !["superadmin", "company_admin"].includes(user.role)) && task.createdBy.toString() !== user._id.toString()) {
      return res.status(403).json({ message: "Insufficient permissions to delete this task" });
    }

    // Remove task from project if it's assigned to one
    if (task.project?.id) {
      await Project.findByIdAndUpdate(task.project.id, {
        $pull: { tasks: task._id }
      });
    }

    await Task.findByIdAndDelete(id);

    res.json({ message: "Task deleted successfully" });
  } catch (error) {
    console.error("Error deleting task:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Get tasks assigned to the current user
 * @route GET /api/tasks/my-tasks
 * @access Private - All authenticated users
 */
export const getMyTasks = async (req: AuthRequest, res: Response) => {
  try {
    const { status, priority, page = 1, limit = 10 } = req.query;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    // Build filter object
    const filter: any = {
      "assignee.id": user._id,
      company: user.company
    };

    if (status) filter.status = status;
    if (priority) filter.priority = priority;

    // Calculate pagination
    const skip = (Number(page) - 1) * Number(limit);

    // Execute query
    const tasks = await Task.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate("assignee.id", "name email avatarUrl")
      .populate("project.id", "name")
      .populate("createdBy", "name email");

    const total = await Task.countDocuments(filter);

    res.json({
      tasks,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit))
    });
  } catch (error) {
    console.error("Error fetching user tasks:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
