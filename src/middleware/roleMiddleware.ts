import { Response, NextFunction } from "express";
import type { RequestHandler } from "express";
import { AuthRequest } from "./authMiddleware";

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

export default authorizeRoles;
