import cloudinary from "../config/cloudinary";
import { UploadApiResponse } from "cloudinary";

export async function uploadBufferToCloudinary(buffer: Buffer, folder: string): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (error, result) => {
        if (error || !result) return reject(error);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

export async function destroyByPublicId(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch {
    // swallow cleanup errors
  }
}

export default { uploadBufferToCloudinary, destroyByPublicId };
