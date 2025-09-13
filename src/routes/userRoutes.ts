import express, { RequestHandler, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/authMiddleware";
import User from "../models/User";
import { z } from "zod";
import validate from "../middleware/validate";
import serializeUser from "../utils/serializeUser";
import AuditLog from "../models/AuditLog";

const router = express.Router();

// GET /api/users/me - get logged-in user's data
const getMeHandler: RequestHandler = async (req, res: Response) => {
  try {
    const { user } = req as AuthRequest;
    if (!user?.id) return res.status(401).json({ message: "Unauthorized" });

    const found = await User.findById(user.id).select("-password");
    if (!found) return res.status(404).json({ message: "User not found" });

    res.json({ user: serializeUser(found) });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

router.get("/me", authMiddleware, getMeHandler);

// PUT /api/users/update - update logged-in user's profile
const updateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(50).optional(),
  jobTitle: z.string().max(100).optional(),
  avatarUrl: z.string().url().max(2048).optional(),
  timezone: z.string().max(100).optional(),
  language: z.string().max(10).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  country: z.string().max(100).optional(),
});

const updateMeHandler: RequestHandler<any, any, any> = async (req, res: Response) => {
  try {
    const { user } = req as AuthRequest<z.infer<typeof updateUserSchema>>;
    if (!user?.id) return res.status(401).json({ message: "Unauthorized" });

    const updatableFields: (keyof z.infer<typeof updateUserSchema>)[] = [
      "firstName",
      "lastName",
      "phone",
      "jobTitle",
      "avatarUrl",
      "timezone",
      "language",
      "status",
      "country",
    ];

    const toUpdate: Partial<z.infer<typeof updateUserSchema>> = {};
    updatableFields.forEach((field) => {
      if (typeof (req.body as any)[field] !== "undefined") {
        (toUpdate as any)[field] = (req.body as any)[field];
      }
    });

    const updated = await User.findByIdAndUpdate(user.id, { $set: toUpdate }, { new: true }).select("-password");
    if (!updated) return res.status(404).json({ message: "User not found" });

    // Audit log
    try {
      await AuditLog.create({
        actorId: user.id as any,
        entityType: "user",
        entityId: updated._id as any,
        action: "update",
        changes: toUpdate,
        ip: (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || undefined,
        userAgent: req.headers["user-agent"] as string,
      });
    } catch {
      // avoid failing the request on audit log error
    }

    res.json({ message: "Profile updated successfully", user: serializeUser(updated) });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

router.put("/update", authMiddleware, validate(updateUserSchema), updateMeHandler);

export default router;
