import { Response } from "express";
import Project from "../models/Project";
import Task from "../models/Task";
import User, { IUser } from "../models/User";
import { AuthRequest } from "../middleware/authMiddleware";

/**
 * Project Controller
 * Handles all project-related operations including CRUD, member management, and task association
 */

/**
 * Get all projects with filtering and pagination
 * @route GET /api/projects
 * @access Private - Company Admin/Employee
 */
export const getAllProjects = async (req: AuthRequest, res: Response) => {
  try {
    const {
      status,
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

    // Calculate pagination
    const skip = (Number(page) - 1) * Number(limit);

    // Build sort object
    const sort: any = {};
    sort[sortBy as string] = sortOrder === "asc" ? 1 : -1;

    // Execute query
    const projects = await Project.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(Number(limit))
      .populate("members", "name email avatarUrl jobTitle")
      .populate("createdBy", "name email")
      .populate({
        path: "tasks",
        select: "title status priority dueDate assignee",
        populate: {
          path: "assignee.id",
          select: "name avatarUrl"
        }
      });

    const total = await Project.countDocuments(filter);

    res.json({
      projects,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit))
    });
  } catch (error) {
    console.error("Error fetching projects:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Get a specific project with its tasks
 * @route GET /api/projects/:id
 * @access Private - Company Admin/Employee
 */
export const getProjectById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const project = await Project.findOne({ _id: id, company: user.company })
      .populate("members", "name email avatarUrl jobTitle")
      .populate("createdBy", "name email")
      .populate({
        path: "tasks",
        populate: [
          {
            path: "assignee.id",
            select: "name email avatarUrl"
          },
          {
            path: "createdBy",
            select: "name email"
          }
        ]
      });

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Calculate actual progress based on completed tasks
    const totalTasks = project.tasks.length;
    const completedTasks = project.tasks.filter((task: any) => task.status === "done").length;
    const calculatedProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Update progress if it's different
    if (project.progress !== calculatedProgress) {
      project.progress = calculatedProgress;
      await project.save();
    }

    res.json(project);
  } catch (error) {
    console.error("Error fetching project:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Create a new project
 * @route POST /api/projects
 * @access Private - Company Admin only
 */
export const createProject = async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, dueDate, memberIds } = req.body;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    // Check if user has permission to create projects (company_admin or higher)
    if (!user.role || !["superadmin", "company_admin"].includes(user.role)) {
      return res.status(403).json({ message: "Insufficient permissions to create projects" });
    }

    // Verify all members exist and belong to the same company
    let members: IUser[] = [];
    if (memberIds && memberIds.length > 0) {
      members = await User.find({
        _id: { $in: memberIds },
        company: user.company
      });

      if (members.length !== memberIds.length) {
        return res.status(400).json({ message: "Some members not found or not in the same company" });
      }
    }

    const projectData = {
      name,
      description,
      dueDate: new Date(dueDate),
      members: members.map(member => member._id),
      tasks: [],
      status: "active",
      progress: 0,
      createdBy: user._id,
      company: user.company
    };

    const project = new Project(projectData);
    await project.save();

    // Populate the response
    await project.populate("members", "name email avatarUrl jobTitle");
    await project.populate("createdBy", "name email");

    res.status(201).json(project);
  } catch (error) {
    console.error("Error creating project:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Update a project
 * @route PUT /api/projects/:id
 * @access Private - Company Admin/Project Creator
 */
export const updateProject = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    // Find the project
    const project = await Project.findOne({ _id: id, company: user.company });
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Check permissions - only company admin or project creator can update
    if ((!user.role || !["superadmin", "company_admin"].includes(user.role)) && project.createdBy.toString() !== user._id.toString()) {
      return res.status(403).json({ message: "Insufficient permissions to update this project" });
    }

    // Handle member updates
    if (updates.memberIds) {
      const members = await User.find({
        _id: { $in: updates.memberIds },
        company: user.company
      });

      if (members.length !== updates.memberIds.length) {
        return res.status(400).json({ message: "Some members not found or not in the same company" });
      }

      updates.members = members.map(member => member._id);
      delete updates.memberIds;
    }

    // Convert dueDate string to Date if provided
    if (updates.dueDate) {
      updates.dueDate = new Date(updates.dueDate);
    }

    const updatedProject = await Project.findByIdAndUpdate(id, updates, { new: true })
      .populate("members", "name email avatarUrl jobTitle")
      .populate("createdBy", "name email")
      .populate({
        path: "tasks",
        populate: {
          path: "assignee.id",
          select: "name avatarUrl"
        }
      });

    res.json(updatedProject);
  } catch (error) {
    console.error("Error updating project:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Delete a project
 * @route DELETE /api/projects/:id
 * @access Private - Company Admin/Project Creator
 */
export const deleteProject = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const project = await Project.findOne({ _id: id, company: user.company });
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Check permissions - only company admin or project creator can delete
    if ((!user.role || !["superadmin", "company_admin"].includes(user.role)) && project.createdBy.toString() !== user._id.toString()) {
      return res.status(403).json({ message: "Insufficient permissions to delete this project" });
    }

    // Remove project reference from all associated tasks
    await Task.updateMany(
      { "project.id": id },
      { $unset: { project: 1 } }
    );

    await Project.findByIdAndDelete(id);

    res.json({ message: "Project deleted successfully" });
  } catch (error) {
    console.error("Error deleting project:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Get all tasks for a specific project
 * @route GET /api/projects/:id/tasks
 * @access Private - Company Admin/Employee
 */
export const getProjectTasks = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, assignee, priority } = req.query;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    // Verify project exists and user has access
    const project = await Project.findOne({ _id: id, company: user.company });
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Build filter object
    const filter: any = {
      "project.id": id,
      company: user.company
    };

    if (status) filter.status = status;
    if (assignee) filter["assignee.id"] = assignee;
    if (priority) filter.priority = priority;

    const tasks = await Task.find(filter)
      .sort({ createdAt: -1 })
      .populate("assignee.id", "name email avatarUrl")
      .populate("createdBy", "name email");

    res.json({ tasks });
  } catch (error) {
    console.error("Error fetching project tasks:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Add members to a project
 * @route POST /api/projects/:id/members
 * @access Private - Company Admin/Project Creator
 */
export const addProjectMembers = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { memberIds } = req.body;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const project = await Project.findOne({ _id: id, company: user.company });
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Check permissions
    if ((!user.role || !["superadmin", "company_admin"].includes(user.role)) && project.createdBy.toString() !== user._id.toString()) {
      return res.status(403).json({ message: "Insufficient permissions to modify project members" });
    }

    // Verify all members exist and belong to the same company
    const members = await User.find({
      _id: { $in: memberIds },
      company: user.company
    });

    if (members.length !== memberIds.length) {
      return res.status(400).json({ message: "Some members not found or not in the same company" });
    }

    // Add members to project (using $addToSet to avoid duplicates)
    const updatedProject = await Project.findByIdAndUpdate(
      id,
      { $addToSet: { members: { $each: memberIds } } },
      { new: true }
    )
      .populate("members", "name email avatarUrl jobTitle")
      .populate("createdBy", "name email");

    res.json(updatedProject);
  } catch (error) {
    console.error("Error adding project members:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Remove a member from a project
 * @route DELETE /api/projects/:id/members/:userId
 * @access Private - Company Admin/Project Creator
 */
export const removeProjectMember = async (req: AuthRequest, res: Response) => {
  try {
    const { id, userId } = req.params;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const project = await Project.findOne({ _id: id, company: user.company });
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Check permissions
    if ((!user.role || !["superadmin", "company_admin"].includes(user.role)) && project.createdBy.toString() !== user._id.toString()) {
      return res.status(403).json({ message: "Insufficient permissions to modify project members" });
    }

    // Remove member from project
    await Project.findByIdAndUpdate(id, {
      $pull: { members: userId }
    });

    res.json({ message: "Member removed successfully" });
  } catch (error) {
    console.error("Error removing project member:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
