import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User";

const JWT_SECRET = process.env.JWT_SECRET || "supersecret"; // keep in .env in production

// REGISTER
export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, adminCode, company } = req.body;

    // check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "User already exists" });

    // Protect admin signup: require ADMIN_SECRET to be set and correct
    if (role === "admin") {
      const ADMIN_SECRET = process.env.ADMIN_SECRET;
      if (!ADMIN_SECRET) {
        return res.status(500).json({ message: "Admin signup is disabled. Set ADMIN_SECRET in server environment to enable." });
      }
      if (adminCode !== ADMIN_SECRET) {
        return res.status(403).json({ message: "Invalid admin code" });
      }
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
      user: { id: user._id, name: user.name, email: user.email, role: user.role, company: user.company ?? null },
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
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        company: user.company ?? null,
      },
      expiresIn: 3600,
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};
