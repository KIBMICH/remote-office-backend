import express, { RequestHandler, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/authMiddleware";
import User from "../models/User";

const router = express.Router();

// GET /api/users/me - get logged-in user's data
const getMeHandler: RequestHandler = async (req, res: Response) => {
  try {
    const { user } = req as AuthRequest;
    if (!user?.id) return res.status(401).json({ message: "Unauthorized" });

    const found = await User.findById(user.id).select("-password");
    if (!found) return res.status(404).json({ message: "User not found" });

    res.json({ user: found });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

router.get("/me", authMiddleware, getMeHandler);

// PUT /api/users/update - update logged-in user's profile
interface UpdateUserBody {
  firstName?: string;
  lastName?: string;
  phone?: string;
  jobTitle?: string;
  avatarUrl?: string;
  timezone?: string;
  language?: string;
  status?: "active" | "inactive";
}

const updateMeHandler: RequestHandler<any, any, any> = async (req, res: Response) => {
  try {
    const { user } = req as AuthRequest<UpdateUserBody>;
    if (!user?.id) return res.status(401).json({ message: "Unauthorized" });

    const updatableFields: (keyof UpdateUserBody)[] = [
      "firstName",
      "lastName",
      "phone",
      "jobTitle",
      "avatarUrl",
      "timezone",
      "language",
      "status",
    ];

    const toUpdate: Partial<UpdateUserBody> = {};
    updatableFields.forEach((field) => {
      if (typeof (req.body as any)[field] !== "undefined") {
        (toUpdate as any)[field] = (req.body as any)[field];
      }
    });

    const updated = await User.findByIdAndUpdate(user.id, { $set: toUpdate }, { new: true }).select("-password");
    if (!updated) return res.status(404).json({ message: "User not found" });

    res.json({ message: "Profile updated successfully", user: updated });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

router.put("/update", authMiddleware, updateMeHandler);

export default router;
