import multer from "multer";

// Memory storage keeps files in memory as Buffer (perfect for piping to Cloudinary)
const storage = multer.memoryStorage();

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

function fileFilter(_req: any, file: any, cb: multer.FileFilterCallback) {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only image files (jpeg, png, webp, gif) are allowed"));
  }
}

export const upload = multer({ storage, limits: { fileSize: MAX_SIZE_BYTES }, fileFilter });

export default upload;
