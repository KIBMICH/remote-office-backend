import { Router } from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

// Step 1: Redirect user to Google login with redirectUri support
router.get("/google", (req, res, next) => {
  // Store redirectUri in session or pass it through state
  const redirectUri = req.query.redirectUri as string;
  if (redirectUri) {
    req.session = req.session || {};
    (req.session as any).redirectUri = redirectUri;
  }
  passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

// Step 2: Handle callback after Google login
router.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  (req: any, res) => {
    try {
      const user = req.user;

      if (!user) {
        const errorRedirectUri = process.env.FRONTEND_URL || 'https://remote-office-frontend.vercel.app' || 'http://localhost:3000';
        return res.redirect(`${errorRedirectUri}/auth/error?error=authentication_failed`);
      }

      // Generate our own JWT for frontend use
      const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET as string, {
        expiresIn: "7d",
      });

      const userData = {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      };

      // Get redirectUri from session or use default
      const redirectUri = (req.session as any)?.redirectUri || 
                         process.env.FRONTEND_URL + '/auth/google-handler' || 
                         'https://remote-office-frontend.vercel.app/auth/google-handler' ||
                         'http://localhost:3000/auth/google-handler';

      // Clear the redirectUri from session
      if (req.session) {
        delete (req.session as any).redirectUri;
      }

      // Redirect to frontend with token and user data
      const redirectUrl = `${redirectUri}?token=${token}&user=${encodeURIComponent(JSON.stringify(userData))}`;
      res.redirect(redirectUrl);
      
    } catch (error) {
      console.error('Google OAuth callback error:', error);
      const errorRedirectUri = process.env.FRONTEND_URL || 'https://remote-office-frontend.vercel.app' || 'http://localhost:3000';
      res.redirect(`${errorRedirectUri}/auth/error?error=oauth_failed`);
    }
  }
);

export default router;
