import express from "express";
import { register, login, createCompany, addUserToCompany, getCompanyUsers, getAllCompanies, changePassword } from "../controllers/authController";
import { authMiddleware } from "../middleware/authMiddleware";
import { requireSuperAdmin, requireCompanyAdmin, requireCompanyAccess } from "../middleware/roleMiddleware";

const router = express.Router();

// Public routes
router.post("/register", register);
router.post("/login", login);

// Authenticated user routes
router.post("/change-password", authMiddleware, changePassword);

// Superadmin only routes
router.post("/companies", authMiddleware, requireSuperAdmin, createCompany);
router.get("/companies", authMiddleware, requireSuperAdmin, getAllCompanies);

// Company admin routes (can also be accessed by superadmin)
router.post("/companies/:companyId/users", authMiddleware, requireCompanyAdmin, addUserToCompany);
router.get("/companies/:companyId/users", authMiddleware, requireCompanyAccess, getCompanyUsers);

export default router;
