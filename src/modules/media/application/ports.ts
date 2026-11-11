/** S3-compatible object storage, abstracted so local development needs no external service. */
export interface StoredObject {
  body: Uint8Array;
  contentType: string;
}

export interface ObjectStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

export interface ProcessedImage {
  body: Uint8Array;
  contentType: "image/jpeg";
  width: number;
  height: number;
}

/**
 * Validates an uploaded file by its content (not its name or declared type), strips all metadata
 * (including GPS), normalises orientation and re-encodes it.
 */
export interface ImageProcessor {
  process(input: Uint8Array): Promise<ProcessedImage>;
}

/** Storage keys are namespaced by visibility: listing photos are public, condition-report photos are not. */
export const PUBLIC_PREFIXES = ["outfits/", "avatars/"] as const;
export const PRIVATE_PREFIXES = ["reports/", "disputes/"] as const;

export function isSafeKey(key: string): boolean {
  return /^[a-z]+\/[a-zA-Z0-9/_-]+\.(jpg|jpeg|png|webp)$/.test(key) && !key.includes("..");
}
