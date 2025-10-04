import { RequestHandler } from "express";

/**
 * Middleware to enforce password change for users with temporary passwords
 * Allows access only to change-password endpoint
 */
export const requirePasswordChangeCheck: RequestHandler = (req, res, next) => {
  const user = (req as any).user;

  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Check if user needs to change password
  if (user.requirePasswordChange) {
    // Allow access to change-password endpoint
    if (req.path.includes('/change-password') && req.method === 'POST') {
      return next();
    }

    // Block all other endpoints
    return res.status(403).json({ 
      message: "Password change required. Please change your password before accessing other features.",
      requirePasswordChange: true,
      changePasswordEndpoint: "/api/auth/change-password"
    });
  }

  // User doesn't need password change, proceed normally
  next();
};
