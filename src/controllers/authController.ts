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

// ADD USER TO COMPANY (Company admin only)
export const addUserToCompany = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role = "employee" } = req.body;
    const { companyId } = req.params;

    // Validate role - company admins can only create employees and members
    if (!["employee", "member"].includes(role)) {
      return res.status(400).json({ message: "Invalid role. Company admins can only create employees and members." });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Get company to verify it exists
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    // Create new user
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role,
      company: companyId
    });
    await newUser.save();

    res.status(201).json({
      message: "User added to company successfully",
      user: serializeUser(newUser)
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
