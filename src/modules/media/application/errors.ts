import { DomainError } from "@/shared/domain/errors";

export class InvalidImageError extends DomainError {
  readonly code = "INVALID_IMAGE";
  constructor(message = "Upload a JPEG, PNG or WebP photograph.") {
    super(message);
  }
}

export class ImageTooLargeError extends DomainError {
  readonly code = "IMAGE_TOO_LARGE";
  override readonly httpStatus = 413;
  constructor(maxBytes: number) {
    super(`Photos must be smaller than ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  }
}
