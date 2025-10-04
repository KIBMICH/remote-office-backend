import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User";

const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

// Generic AuthRequest that preserves all Express Request properties and
// allows specifying the body type via `T`.
export interface AuthRequest<T = any> extends Request<any, any, T> {
  user?: {
    id: string;
    _id: string;
    email: string;
    role?: string;
    company?: string;
    requirePasswordChange?: boolean;
  };
}

import type { RequestHandler } from "express";

export const authMiddleware: RequestHandler = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ message: "No token, authorization denied" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string; role?: string; company?: string };
    
    // Fetch user to get requirePasswordChange status
    const user = await User.findById(decoded.id).select('requirePasswordChange').lean();
    
    (req as AuthRequest).user = {
      ...decoded,
      _id: decoded.id, // Map id to _id for consistency with MongoDB ObjectId
      requirePasswordChange: user?.requirePasswordChange || false
    };
    next();
  } catch (error) {
    res.status(401).json({ message: "Token is not valid" });
  }
};

// Alias for consistency with other middleware naming
export const requireAuth = authMiddleware;
