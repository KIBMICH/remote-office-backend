import express, { Request, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/authMiddleware";
import { authorizeRoles } from "../middleware/roleMiddleware";
import Company from "../models/Company";
import User from "../models/User";

const router = express.Router();

// Create a company (admin only). The creating admin becomes `createdBy`.
router.post("/create", authMiddleware, authorizeRoles("admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { name, address } = req.body;
    if (!name) return res.status(400).json({ message: "Company name is required" });

    const existing = await Company.findOne({ name });
    if (existing) return res.status(400).json({ message: "Company already exists" });

    const company = new Company({ name, address, createdBy: req.user.id });
    await company.save();
    res.status(201).json({ message: "Company created successfully", company });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Link an existing user to a company (admin only)
router.post("/link-user", authMiddleware, authorizeRoles("admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { userId, companyId } = req.body;
    if (!userId || !companyId) return res.status(400).json({ message: "userId and companyId are required" });

    const user = await User.findById(userId);
    const company = await Company.findById(companyId);
    if (!user || !company) return res.status(404).json({ message: "User or Company not found" });

    user.company = String(company._id);
    await user.save();

    res.json({ message: "User linked to company successfully", user });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
