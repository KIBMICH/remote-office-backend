import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User";
import Company from "../models/Company";
import serializeUser from "../utils/serializeUser";
import { AuthRequest } from "../middleware/authMiddleware";
import { Types } from "mongoose";

const JWT_SECRET = process.env.JWT_SECRET || "supersecret"; // keep in .env in production

// REGISTER
export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, adminCode, company } = req.body;

    // check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "User already exists" });

    // Protect superadmin signup: require SUPERADMIN_SECRET to be set and correct
    if (role === "superadmin") {
      const SUPERADMIN_SECRET = process.env.SUPERADMIN_SECRET;
      if (!SUPERADMIN_SECRET) {
        return res.status(500).json({ message: "Superadmin signup is disabled. Set SUPERADMIN_SECRET in server environment to enable." });
      }
      if (adminCode !== SUPERADMIN_SECRET) {
        return res.status(403).json({ message: "Invalid superadmin code" });
      }
    }

    // Protect company_admin signup: only superadmin can create company admins
    if (role === "company_admin") {
      return res.status(403).json({ message: "Company admin accounts can only be created by superadmin when creating a company" });
    }

    // hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // save user (default role to 'employee' if not provided)
    const user = new User({ name, email, password: hashedPassword, role: role || "employee", company });
    await user.save();

    // generate token including role
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role, company: user.company },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: serializeUser(user),
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};

// LOGIN
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // check if user exists
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    // check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    // create token (include role and company)
    const token = jwt.sign({ id: user._id, email: user.email, role: user.role, company: user.company }, JWT_SECRET, {
      expiresIn: "1h",
    });
    // return richer response useful for clients (but never include password)
    res.json({
      message: "Login successful",
      token,
      user: serializeUser(user),
      expiresIn: 3600,
      requirePasswordChange: user.requirePasswordChange || false
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};

// CREATE COMPANY (Superadmin only)
export const createCompany = async (req: Request, res: Response) => {
  try {
    const { user } = req as AuthRequest;
    const { 
      companyName, 
      adminName, 
      adminEmail, 
      adminPassword,
      industry,
      address,
      phone,
      website,
      country
    } = req.body;

    // Check if company already exists
    const existingCompany = await Company.findOne({ name: companyName });
    if (existingCompany) {
      return res.status(400).json({ message: "Company already exists" });
    }

    // Check if admin email already exists
    const existingAdmin = await User.findOne({ email: adminEmail });
    if (existingAdmin) {
      return res.status(400).json({ message: "Admin email already exists" });
    }

    // Create company admin user
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    const adminUser = new User({
      name: adminName,
      email: adminEmail,
      password: hashedPassword,
      role: "company_admin"
    });
    await adminUser.save();

    // Create company with admin reference
    const company = new Company({
      name: companyName,
      admin: adminUser._id,
      createdBy: user?._id,
      industry,
      address,
      phone,
      website,
      country
    });
    await company.save();

    // Update admin user with company reference
    adminUser.company = String(company._id);
    await adminUser.save();

    res.status(201).json({
      message: "Company and admin created successfully",
      company: {
        id: String(company._id),
        name: company.name,
        admin: {
          id: String(adminUser._id),
          name: adminUser.name,
          email: adminUser.email
        }
      }
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * Generate a random secure password
 */
const generateTemporaryPassword = (): string => {
  const length = 12;
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  
  // Ensure at least one of each type
  password += "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)]; // Uppercase
  password += "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]; // Lowercase
  password += "0123456789"[Math.floor(Math.random() * 10)]; // Number
  password += "!@#$%^&*"[Math.floor(Math.random() * 8)]; // Special char
  
  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

// ADD USER TO COMPANY (Company admin only)
export const addUserToCompany = async (req: Request, res: Response) => {
  try {
    const { name, email, role = "employee" } = req.body;
    const { companyId } = req.params;

    // Validate role - company admins can only create employees and members
    if (!["employee", "member"].includes(role)) {
      return res.status(400).json({ message: "Invalid role. Company admins can only create employees and members." });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email }).populate('company', 'name');
    if (existingUser) {
      const companyName = (existingUser.company as any)?.name || 'Unknown Company';
      return res.status(400).json({ 
        message: "User already exists",
        details: `A user with email ${email} already exists in ${companyName}`,
        existingUser: {
          id: existingUser._id,
          name: existingUser.name,
          email: existingUser.email,
          role: existingUser.role,
          company: companyName
        }
      });
    }

    // Get company to verify it exists
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    // Generate temporary password
    const temporaryPassword = generateTemporaryPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
    
    // Create new user with requirePasswordChange flag
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role,
      company: companyId,
      requirePasswordChange: true // Flag to force password change on first login
    });
    await newUser.save();

    // TODO: Send email with temporary password
    // await sendWelcomeEmail(email, name, temporaryPassword, company.name);

    res.status(201).json({
      message: "User added to company successfully",
      user: serializeUser(newUser),
      temporaryPassword // IMPORTANT: Only return this in development. Remove in production and send via email
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};

// GET COMPANY USERS (Company admin and superadmin)
export const getCompanyUsers = async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;

    const users = await User.find({ company: companyId }).select('-password');
    
    res.json({
      message: "Company users retrieved successfully",
      users: users.map(user => serializeUser(user))
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};

// GET ALL COMPANIES (Superadmin only)
export const getAllCompanies = async (req: Request, res: Response) => {
  try {
    const companies = await Company.find()
      .populate('admin', 'name email')
      .populate('createdBy', 'name email');

    res.json({
      message: "Companies retrieved successfully",
      companies
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};

// CHANGE PASSWORD (Authenticated users)
export const changePassword = async (req: Request, res: Response) => {
  try {
    const { user } = req as AuthRequest;
    const { currentPassword, newPassword } = req.body;

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Get user with password
    const userDoc = await User.findById(user._id);
    if (!userDoc) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, userDoc.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    // Validate new password strength (basic validation)
    if (newPassword.length < 8) {
      return res.status(400).json({ message: "New password must be at least 8 characters long" });
    }

    // Hash and update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    userDoc.password = hashedPassword;
    userDoc.requirePasswordChange = false; // Clear the flag
    await userDoc.save();

    res.json({
      message: "Password changed successfully",
      requirePasswordChange: false
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};
