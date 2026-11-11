import "server-only";
import { randomUUID } from "node:crypto";
import type { ImageProcessor, ObjectStorage } from "@/modules/media";
import type { ReportPhotoStore } from "../application/ports";

/** Condition-report photos are private (served only to participants and admins by /api/files). */
export function storageReportPhotoStore(storage: ObjectStorage, images: ImageProcessor): ReportPhotoStore {
  return {
    async save(bookingId, bytes) {
      const processed = await images.process(bytes);
      const key = `reports/${bookingId}/${randomUUID()}.jpg`;
      await storage.put(key, processed.body, processed.contentType);
      return key;
    },
  };
}
