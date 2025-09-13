import { ZodSchema } from "zod";
import { RequestHandler } from "express";

export const validate = (schema: ZodSchema): RequestHandler => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ message: "Validation failed", errors: result.error.flatten() });
  }
  req.body = result.data;
  next();
};

export default validate;
