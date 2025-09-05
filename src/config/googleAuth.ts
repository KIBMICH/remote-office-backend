import passport from "passport";
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";
import dotenv from "dotenv";
import User from "../models/User";
import bcrypt from "bcryptjs";

dotenv.config();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      callbackURL: process.env.GOOGLE_CALLBACK_URL as string,
    },
    async (_accessToken, _refreshToken, profile: Profile, done) => {
      try {
        // Check if user already exists
        const existingUser = await User.findOne({ email: profile.emails?.[0].value });

        if (existingUser) {
          return done(null, existingUser);
        }

        // Create a new user if not exists
        const newUser = new User({
          name: profile.displayName,
          email: profile.emails?.[0].value,
          password: await bcrypt.hash(Math.random().toString(36), 10), // dummy password
          role: "employee", // default role
          avatar: profile.photos?.[0].value,
          googleId: profile.id,
        });

        await newUser.save();
        return done(null, newUser);
      } catch (error) {
        return done(error, undefined);
      }
    }
  )
);

// Serialize and deserialize user (optional but good practice)
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  const user = await User.findById(id);
  done(null, user);
});

export default passport;
