import sharp from "sharp";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const UPLOAD_DIR = path.resolve(process.cwd(), "../frontend/public/images/catalog");

// Validate magic bytes to avoid extension-spoofing
function validateImageMagicBytes(buffer: Buffer): "jpeg" | "png" | "webp" | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }

  // WebP: 'RIFF' at 0..3 and 'WEBP' at 8..11
  const riff = buffer.toString("ascii", 0, 4);
  const webp = buffer.toString("ascii", 8, 12);
  if (riff === "RIFF" && webp === "WEBP") {
    return "webp";
  }

  return null;
}

export async function processAndSaveCatalogImage(
  fileBuffer: Buffer,
  originalFilename: string
): Promise<{ url: string; width: number; height: number }> {
  // 1. Verify buffer length (max 5 MB)
  if (fileBuffer.length > 5 * 1024 * 1024) {
    throw new Error("IMAGE_TOO_LARGE: File size must not exceed 5 MB.");
  }

  // 2. Magic bytes check
  const detectedType = validateImageMagicBytes(fileBuffer);
  if (!detectedType) {
    throw new Error("INVALID_IMAGE_TYPE: Only authentic JPEG, PNG, or WebP files are accepted.");
  }

  // 3. Inspect metadata with sharp
  const image = sharp(fileBuffer);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("CORRUPT_IMAGE: Could not decode image dimensions.");
  }

  if (metadata.width > 3000 || metadata.height > 3000) {
    throw new Error("DIMENSIONS_EXCEEDED: Maximum image dimensions are 3000x3000px.");
  }

  // 4. Ensure upload directory exists
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  // 5. Re-encode with sharp:
  // - Strips EXIF / GPS / XML payloads
  // - Resizes if max dimension exceeds 1200px
  // - Encodes as clean WebP with 85% quality
  const filename = `${crypto.randomUUID()}.webp`;
  const targetPath = path.join(UPLOAD_DIR, filename);

  const processedBuffer = await sharp(fileBuffer)
    .resize(1200, 1200, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 85, effort: 4 })
    .toBuffer();

  await fs.writeFile(targetPath, processedBuffer);

  const processedMetadata = await sharp(processedBuffer).metadata();

  return {
    url: `/images/catalog/${filename}`,
    width: processedMetadata.width || 800,
    height: processedMetadata.height || 600,
  };
}
