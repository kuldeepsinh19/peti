import type { RateLimitRule } from "@/shared/application/rate-limiter";

/**
 * Per-user limits for Server Actions that write user content or accept uploads. Auth endpoints are limited
 * by Better Auth; booking requests are limited inside the use case (BOOKING_REQUEST_LIMIT).
 */
export const LIMITS = {
  photoUpload: { name: "photo-upload", limit: 40, windowSeconds: 3600 },
  reportUpload: { name: "report-upload", limit: 20, windowSeconds: 3600 },
  listingWrite: { name: "listing-write", limit: 30, windowSeconds: 3600 },
  disputeWrite: { name: "dispute-write", limit: 20, windowSeconds: 3600 },
  reviewWrite: { name: "review-write", limit: 20, windowSeconds: 3600 },
  savedToggle: { name: "saved-toggle", limit: 120, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;
