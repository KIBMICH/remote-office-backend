import express, { Response, RequestHandler } from "express";
import { authMiddleware, AuthRequest } from "../middleware/authMiddleware";
import { authorizeRoles, requireSuperAdmin, requireCompanyAdmin, requireCompanyAccess } from "../middleware/roleMiddleware";
import Company from "../models/Company";
import User from "../models/User";
import { z } from "zod";
import validate from "../middleware/validate";
import AuditLog from "../models/AuditLog";
import upload from "../middleware/upload";
import { uploadBufferToCloudinary, destroyByPublicId } from "../utils/cloudinaryUpload";

const router = express.Router();

// Define body types (removed CreateCompanyBody and LinkUserBody as they're no longer needed)

// Get companies based on user role - consolidated endpoint
const getCompanyHandler: RequestHandler = async (req, res: Response) => {
  try {
    const { user } = req as AuthRequest;
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    if (user.role === "superadmin") {
      // Superadmin can see all companies
      const companies = await Company.find()
        .populate('admin', 'name email')
        .populate('createdBy', 'name email');
      
      return res.json({ 
        message: "All companies retrieved successfully", 
        companies 
      });
    } else {
      // Other roles see their own company
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
      
      return res.json({ 
        message: "Company retrieved successfully", 
        company 
      });
    }
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

    // Find company based on role-based access
    let company = null as any;
    const currentUser = await User.findById(user.id);
    
    if (user.role === "superadmin") {
      // Superadmin can update any company - get from request params or user's company
      const companyId = req.params.companyId || currentUser?.company;
      if (companyId) {
        company = await Company.findById(companyId);
      }
    } else if (user.role === "company_admin") {
      // Company admin can only update their assigned company
      if (currentUser?.company) {
        company = await Company.findById(currentUser.company);
        // Verify this user is actually the admin of this company
        if (company && company.admin.toString() !== user.id) {
          return res.status(403).json({ message: "Forbidden: Not authorized to update this company" });
        }
      }
    } else {
      return res.status(403).json({ message: "Forbidden: Insufficient permissions to update company" });
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

router.put("/update", authMiddleware, authorizeRoles("superadmin", "company_admin"), validate(updateCompanySchema), updateCompanyHandler);
router.put("/:companyId/update", authMiddleware, authorizeRoles("superadmin", "company_admin"), validate(updateCompanySchema), updateCompanyHandler);

// PATCH /api/companies/logo - upload and update company logo (superadmin or company_admin)
const uploadLogoHandler: RequestHandler = async (req, res: Response) => {
  try {
    const { user } = req as AuthRequest;
    if (!user?.id) return res.status(401).json({ message: "Unauthorized" });

    const file = (req as any).file as any;
    if (!file || !file.buffer) {
      return res.status(400).json({ message: "No image file uploaded" });
    }

    // Find company based on role-based access
    let company: any = null;
    const currentUser = await User.findById(user.id);
    
    if (user.role === "superadmin") {
      // Superadmin can update any company logo - get from request params or user's company
      const companyId = req.params.companyId || currentUser?.company;
      if (companyId) {
        company = await Company.findById(companyId);
      }
    } else if (user.role === "company_admin") {
      // Company admin can only update their assigned company logo
      if (currentUser?.company) {
        company = await Company.findById(currentUser.company);
        // Verify this user is actually the admin of this company
        if (company && company.admin.toString() !== user.id) {
          return res.status(403).json({ message: "Forbidden: Not authorized to update this company" });
        }
      }
    } else {
      return res.status(403).json({ message: "Forbidden: Insufficient permissions to update company logo" });
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

router.patch("/logo", authMiddleware, authorizeRoles("superadmin", "company_admin"), upload.single("logo"), uploadLogoHandler);
router.patch("/:companyId/logo", authMiddleware, authorizeRoles("superadmin", "company_admin"), upload.single("logo"), uploadLogoHandler);

export default router;
