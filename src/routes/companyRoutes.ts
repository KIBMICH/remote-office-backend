import express, { Response, RequestHandler } from "express";
import { authMiddleware, AuthRequest } from "../middleware/authMiddleware";
import { authorizeRoles } from "../middleware/roleMiddleware";
import Company from "../models/Company";
import User from "../models/User";
import { z } from "zod";
import validate from "../middleware/validate";
import AuditLog from "../models/AuditLog";
import upload from "../middleware/upload";
import { uploadBufferToCloudinary, destroyByPublicId } from "../utils/cloudinaryUpload";

const router = express.Router();

// Define body types
interface CreateCompanyBody {
  name: string;
  address?: string;
}

interface LinkUserBody {
  userId: string;
  companyId: string;
}

// Create a company (admin only). The creating admin becomes `createdBy`.
const createCompanyHandler: RequestHandler<any, any, any> = async (req, res: Response) => {
  try {
    const { name, address } = req.body as CreateCompanyBody;
    if (!name) return res.status(400).json({ message: "Company name is required" });

    const existing = await Company.findOne({ name });
    if (existing) return res.status(400).json({ message: "Company already exists" });

    const userId = (req as AuthRequest).user?.id;
    const company = new Company({ name, address, createdBy: userId });
    await company.save();
    res.status(201).json({ message: "Company created successfully", company });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

router.post("/create", authMiddleware, authorizeRoles("admin"), createCompanyHandler);

// Link an existing user to a company (admin only)
const linkUserHandler: RequestHandler<any, any, any> = async (req, res: Response) => {
  try {
    const { userId, companyId } = req.body as LinkUserBody;
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
};

router.post("/link-user", authMiddleware, authorizeRoles("admin"), linkUserHandler);

// Get the current user's company profile
const getCompanyHandler: RequestHandler = async (req, res: Response) => {
  try {
    const { user } = req as AuthRequest;
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    // Prefer user's company reference if available
    let company = null as any;
    if (user.id) {
      const currentUser = await User.findById(user.id);
      if (currentUser?.company) {
        company = await Company.findById(currentUser.company);
      }
    }
    // Fallback: company created by the user (useful for initial setup)
    if (!company) {
      company = await Company.findOne({ createdBy: user.id });
    }
    if (!company) return res.status(404).json({ message: "Company not found" });
    res.json({ company });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

router.get("/", authMiddleware, getCompanyHandler);

// Update company profile (admin or owner)
const updateCompanySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  logoUrl: z.string().url().max(2048).optional(),
  industry: z.string().max(100).optional(),
  address: z.string().max(300).optional(),
  phone: z.string().max(50).optional(),
  website: z.string().url().max(2048).optional(),
  email: z.string().email().max(200).optional(),
  country: z.string().max(100).optional(),
  subscriptionPlan: z.enum(["free", "pro", "enterprise"]).optional(),
  subscriptionStatus: z.enum(["active", "canceled", "trial"]).optional(),
  billingCycle: z.enum(["monthly", "yearly"]).optional(),
});

const updateCompanyHandler: RequestHandler<any, any, any> = async (req, res: Response) => {
  try {
    const { user } = req as AuthRequest<z.infer<typeof updateCompanySchema>>;
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    // find company associated with the user
    let company = null as any;
    const currentUser = await User.findById(user.id);
    if (currentUser?.company) {
      company = await Company.findById(currentUser.company);
    } else {
      company = await Company.findOne({ createdBy: user.id });
    }
    if (!company) return res.status(404).json({ message: "Company not found" });

    const updatableFields: (keyof z.infer<typeof updateCompanySchema>)[] = [
      "name", "logoUrl", "industry", "address", "phone", "website", "email", "country",
      "subscriptionPlan", "subscriptionStatus", "billingCycle"
    ];
    updatableFields.forEach((field) => {
      if (typeof (req.body as any)[field] !== "undefined") {
        (company as any)[field] = (req.body as any)[field];
      }
    });

    await company.save();
    // Audit log
    try {
      const changes: Partial<z.infer<typeof updateCompanySchema>> = {};
      updatableFields.forEach((f) => {
        if (typeof (req.body as any)[f] !== "undefined") {
          (changes as any)[f] = (req.body as any)[f];
        }
      });
      await AuditLog.create({
        actorId: user.id as any,
        entityType: "company",
        entityId: company._id as any,
        action: "update",
        changes,
        ip: (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || undefined,
        userAgent: req.headers["user-agent"] as string,
      });
    } catch {
      // swallow audit errors
    }
    res.json({ message: "Company updated successfully", company });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

router.put("/update", authMiddleware, authorizeRoles("admin", "owner"), validate(updateCompanySchema), updateCompanyHandler);

// PATCH /api/companies/logo - upload and update company logo (admin or owner)
const uploadLogoHandler: RequestHandler = async (req, res: Response) => {
  try {
    const { user } = req as AuthRequest;
    if (!user?.id) return res.status(401).json({ message: "Unauthorized" });

    const file = (req as any).file as any;
    if (!file || !file.buffer) {
      return res.status(400).json({ message: "No image file uploaded" });
    }

    // find company associated with the user
    let company: any = null;
    const currentUser = await User.findById(user.id);
    if (currentUser?.company) {
      company = await Company.findById(currentUser.company);
    } else {
      company = await Company.findOne({ createdBy: user.id });
    }
    if (!company) return res.status(404).json({ message: "Company not found" });

    const folder = `remoteoffice/companies/${company._id}`;
    const result = await uploadBufferToCloudinary(file.buffer, folder);

    // cleanup previous logo if any
    if (company.logoPublicId) {
      await destroyByPublicId(company.logoPublicId);
    }

    company.logoUrl = result.secure_url;
    company.logoPublicId = result.public_id;
    await company.save();

    try {
      await AuditLog.create({
        actorId: user.id as any,
        entityType: "company",
        entityId: company._id as any,
        action: "update_logo",
        changes: { logoUrl: company.logoUrl },
        ip: (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || undefined,
        userAgent: req.headers["user-agent"] as string,
      });
    } catch {}

    res.json({ message: "Logo updated successfully", company });
  } catch (error: any) {
    const msg = error?.message || "Server error";
    res.status(500).json({ message: msg });
  }
};

router.patch("/logo", authMiddleware, authorizeRoles("admin", "owner"), upload.single("logo"), uploadLogoHandler);

export default router;
