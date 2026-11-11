import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { ImageTooLargeError, InvalidImageError } from "../application/errors";
import type { ImageProcessor, ProcessedImage } from "../application/ports";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_DIMENSION = 2000;

/**
 * Trust the bytes, not the filename: the type is detected from magic numbers, then sharp decodes and
 * re-encodes the image, which drops EXIF (including GPS), ICC and any embedded payloads.
 */
export function sharpImageProcessor(maxBytes: number): ImageProcessor {
  return {
    async process(input: Uint8Array): Promise<ProcessedImage> {
      if (input.byteLength > maxBytes) throw new ImageTooLargeError(maxBytes);
      const type = await fileTypeFromBuffer(input);
      if (!type || !ALLOWED.has(type.mime)) throw new InvalidImageError();
      try {
        const { data, info } = await sharp(input, { limitInputPixels: 40_000_000 })
          .rotate()
          .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 80, mozjpeg: true })
          .toBuffer({ resolveWithObject: true });
        return {
          body: new Uint8Array(data),
          contentType: "image/jpeg",
          width: info.width,
          height: info.height,
        };
      } catch {
        throw new InvalidImageError("That photograph could not be read. Try another file.");
      }
    },
  };
}
