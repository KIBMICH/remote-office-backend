import { Router } from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

// Step 1: Redirect user to Google login
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

// Step 2: Handle callback after Google login
router.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  (req: any, res) => {
    const user = req.user;

    // Generate our own JWT for frontend use
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET as string, {
      expiresIn: "7d",
    });

    // Redirect or send token back
    res.json({
      message: "Google login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  }
);

export default router;
