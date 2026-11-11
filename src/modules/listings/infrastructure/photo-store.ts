import "server-only";
import { randomUUID } from "node:crypto";
import type { ImageProcessor, ObjectStorage } from "@/modules/media";
import type { PhotoStore } from "../application/ports";

export function storagePhotoStore(storage: ObjectStorage, images: ImageProcessor): PhotoStore {
  return {
    async save(outfitId, bytes) {
      const processed = await images.process(bytes);
      const storageKey = `outfits/${outfitId}/${randomUUID()}.jpg`;
      await storage.put(storageKey, processed.body, processed.contentType);
      return { storageKey, width: processed.width, height: processed.height };
    },
    remove: (storageKey) => storage.delete(storageKey),
  };
}
