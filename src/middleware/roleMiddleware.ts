import { Response, NextFunction } from "express";
import type { RequestHandler } from "express";
import { AuthRequest } from "./authMiddleware";
import Company from "../models/Company";

export const authorizeRoles = (...allowedRoles: string[]) => {
  const handler: RequestHandler = (req, res: Response, next: NextFunction) => {
    const { user } = req as AuthRequest;
    const role = user?.role;
    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({ message: "Forbidden: Insufficient role" });
    }
    next();
  };
  return handler;
};

// Middleware to check if user is superadmin (can create companies)
export const requireSuperAdmin: RequestHandler = (req, res: Response, next: NextFunction) => {
  const { user } = req as AuthRequest;
  if (user?.role !== "superadmin") {
    return res.status(403).json({ message: "Forbidden: Superadmin access required" });
  }
  next();
};

// Middleware to check if user is company admin for the specified company
export const requireCompanyAdmin: RequestHandler = async (req, res: Response, next: NextFunction) => {
  try {
    const { user } = req as AuthRequest;
    const companyId = req.params.companyId || req.body.companyId;

    if (!companyId) {
      return res.status(400).json({ message: "Company ID is required" });
    }

    // Superadmin can access any company
    if (user?.role === "superadmin") {
      return next();
    }

    // Check if user is the admin of this specific company
    if (user?.role === "company_admin") {
      const company = await Company.findById(companyId);
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }
      
      if (company.admin.toString() === user._id.toString()) {
        return next();
      }
    }

    return res.status(403).json({ message: "Forbidden: Company admin access required" });
  } catch (error) {
    return res.status(500).json({ message: "Error checking company admin permissions" });
  }
};

// Middleware to check if user belongs to a company or is admin/superadmin
export const requireCompanyAccess: RequestHandler = async (req, res: Response, next: NextFunction) => {
  try {
    const { user } = req as AuthRequest;
    const companyId = req.params.companyId || req.body.companyId || user?.company;

    if (!companyId) {
      return res.status(400).json({ message: "Company ID is required" });
    }

    // Superadmin can access any company
    if (user?.role === "superadmin") {
      return next();
    }

    // Company admin can access their company
    if (user?.role === "company_admin") {
      const company = await Company.findById(companyId);
      if (company && company.admin.toString() === user._id.toString()) {
        return next();
      }
    }

    // Regular users can only access their own company
    if (user?.company && user.company.toString() === companyId.toString()) {
      return next();
    }

    return res.status(403).json({ message: "Forbidden: No access to this company" });
  } catch (error) {
    return res.status(500).json({ message: "Error checking company access permissions" });
  }
};

export default authorizeRoles;
