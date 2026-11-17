"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { marketplacePolicy } from "@/config/marketplace-policy";
import { fileUrl } from "@/modules/media";
import type { ActionResult } from "@/shared/contracts/action-result";
import { cn } from "@/shared/ui/cn";
import { downscaleImage } from "@/shared/ui/downscale-image";
import { FormMessage } from "@/shared/ui/form";
import type { ListingPhoto } from "../application/ports";

const CONNECTION_ERROR = "That did not reach Peti. Check your connection and try again.";
/** The policy limit, capped below the smallest request limit we deploy behind (Vercel accepts 4.5 MB). */
export const MAX_PHOTO_UPLOAD_BYTES = Math.min(marketplacePolicy.maxUploadBytes, 4 * 1024 * 1024);
export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

type Stage = "waiting" | "preparing" | "uploading" | "done" | "failed";

interface QueuedPhoto {
  key: string;
  name: string;
  preview: string | null;
  stage: Stage;
  error?: string;
  file: File;
}

const STAGE_LABEL: Record<Stage, string> = {
  waiting: "Waiting",
  preparing: "Preparing",
  uploading: "Uploading",
  done: "Added",
  failed: "Not added",
};

type Action<T> = (formData: FormData) => Promise<ActionResult<T>>;

/**
 * The photographs step of listing an outfit: choose or drop several photographs, watch each one upload,
 * remove any, and choose the cover renters see first. Photographs upload one at a time through a Server
 * Action; the server checks each file's content, strips metadata (including location) and re-encodes it —
 * the checks here only save the owner a wasted upload.
 */
export function PhotoManager({
  outfitId,
  photos,
  upload,
  remove,
  makeCover,
  uploadsDisabledReason = null,
}: {
  outfitId: string;
  photos: ListingPhoto[];
  upload: Action<{ id: string }>;
  remove: Action<undefined>;
  makeCover: Action<undefined>;
  /** Shown instead of the drop zone when photographs cannot be added here (the public demo). */
  uploadsDisabledReason?: string | null;
}) {
  const router = useRouter();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueuedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busyPhoto, setBusyPhoto] = useState<string | null>(null);
  const uploading = queue.some((q) => q.stage !== "done" && q.stage !== "failed");
  const room = marketplacePolicy.maxListingPhotos - photos.length;

  // Release the local previews when they are no longer shown.
  const previews = useRef(new Set<string>());
  useEffect(() => {
    const urls = previews.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  const update = (key: string, patch: Partial<QueuedPhoto>) =>
    setQueue((all) => all.map((q) => (q.key === key ? { ...q, ...patch } : q)));

  async function add(chosen: File[]) {
    setError(null);
    if (chosen.length === 0) return;
    let files = chosen;
    if (files.length > room) {
      setError(
        room > 0
          ? `You can add ${room} more photograph${room === 1 ? "" : "s"} (up to ${marketplacePolicy.maxListingPhotos}).`
          : `This listing already has the maximum of ${marketplacePolicy.maxListingPhotos} photographs.`,
      );
      files = files.slice(0, Math.max(room, 0));
    }
    const items: QueuedPhoto[] = files.map((file, i) => {
      const supported = (ACCEPTED_PHOTO_TYPES as readonly string[]).includes(file.type);
      const preview =
        supported && typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null;
      if (preview) previews.current.add(preview);
      return {
        key: `${Date.now()}-${i}-${file.name}`,
        name: file.name,
        file,
        preview,
        stage: supported ? "waiting" : "failed",
        ...(supported ? {} : { error: "Use a JPEG, PNG or WebP photograph." }),
      };
    });
    setQueue((all) => [...all.filter((q) => q.stage !== "done"), ...items]);

    let added = false;
    for (const item of items) {
      if (item.stage === "failed") continue;
      update(item.key, { stage: "preparing" });
      try {
        const file = await downscaleImage(item.file);
        if (file.size > MAX_PHOTO_UPLOAD_BYTES) {
          update(item.key, {
            stage: "failed",
            error: `Larger than ${MAX_PHOTO_UPLOAD_BYTES / 1024 / 1024} MB, even after resizing.`,
          });
          continue;
        }
        update(item.key, { stage: "uploading" });
        const data = new FormData();
        data.set("outfitId", outfitId);
        data.set("photo", file);
        data.set("altText", "");
        const result = await upload(data);
        if (result.ok) {
          update(item.key, { stage: "done" });
          added = true;
        } else {
          update(item.key, { stage: "failed", error: result.error.message });
        }
      } catch {
        update(item.key, { stage: "failed", error: CONNECTION_ERROR });
      }
    }
    if (input.current) input.current.value = "";
    if (added) router.refresh();
  }

  async function run(action: Action<undefined>, photoId: string) {
    const data = new FormData();
    data.set("outfitId", outfitId);
    data.set("photoId", photoId);
    setBusyPhoto(photoId);
    setError(null);
    try {
      const result = await action(data);
      if (!result.ok) setError(result.error.message);
      router.refresh();
    } catch {
      setError(CONNECTION_ERROR);
    } finally {
      setBusyPhoto(null);
    }
  }

  const pending = queue.filter((q) => q.stage !== "done");

  return (
    <div className="flex flex-col gap-8">
      <FormMessage>{error}</FormMessage>

      {photos.length > 0 ? (
        <ul
          aria-label="Photographs"
          className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4"
        >
          {photos.map((p, i) => (
            <li key={p.id} className="flex flex-col gap-2">
              <div
                className={cn(
                  "relative aspect-[3/4] overflow-hidden bg-sand",
                  i === 0 && "outline-2 outline-offset-2 outline-burgundy",
                )}
              >
                <Image
                  src={fileUrl(p.storageKey)}
                  alt={p.altText}
                  fill
                  sizes="25vw"
                  className="object-cover"
                  unoptimized
                />
                {i === 0 ? (
                  <span className="absolute top-0 left-0 bg-burgundy px-2 py-1 eyebrow text-paper">
                    Cover
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-caption">
                {i === 0 ? (
                  <span className="text-graphite">Shown first in Explore</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => run(makeCover, p.id)}
                    disabled={busyPhoto !== null}
                    className="text-ink underline disabled:opacity-50"
                    aria-label={`Make photo ${i + 1} the cover`}
                  >
                    Make cover
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => run(remove, p.id)}
                  disabled={busyPhoto !== null}
                  className="text-burgundy underline disabled:opacity-50"
                  aria-label={`Remove photo ${i + 1}`}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {pending.length > 0 ? (
        <ul aria-label="Uploads" className="flex flex-col divide-y divide-rule border-y border-rule">
          {pending.map((q) => (
            <li key={q.key} className="flex items-center gap-4 py-3">
              <div className="relative h-16 w-12 shrink-0 overflow-hidden bg-sand">
                {q.preview ? (
                  // A local object URL: next/image cannot optimise it, and does not need to.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={q.preview} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{q.name}</p>
                {q.error ? <p className="text-caption text-danger">{q.error}</p> : null}
              </div>
              <span
                role="status"
                className={cn("eyebrow", q.stage === "failed" ? "text-danger" : "text-graphite")}
              >
                {STAGE_LABEL[q.stage]}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {uploadsDisabledReason ? (
        <p className="border border-rule-strong px-5 py-4 text-sm text-graphite">{uploadsDisabledReason}</p>
      ) : room > 0 ? (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!uploading) void add(Array.from(e.dataTransfer.files));
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-3 border border-dashed px-6 py-12 text-center transition-colors duration-150 motion-reduce:transition-none",
            dragging ? "border-burgundy bg-ivory" : "border-rule-strong hover:border-ink",
            uploading && "pointer-events-none opacity-60",
          )}
        >
          <span className="font-display text-2xl">
            {photos.length === 0 ? "Add your photographs" : "Add more photographs"}
          </span>
          <span className="max-w-md text-sm text-graphite">
            Drop them here or <span className="text-burgundy underline">choose from your device</span>. JPEG,
            PNG or WebP; up to {room} more. A listing needs at least {marketplacePolicy.minListingPhotos}{" "}
            before it can be submitted. Large phone photos are resized for you.
          </span>
          <input
            id={inputId}
            ref={input}
            type="file"
            multiple
            accept={ACCEPTED_PHOTO_TYPES.join(",")}
            disabled={uploading}
            aria-label="Choose photographs"
            onChange={(e) => void add(Array.from(e.target.files ?? []))}
            className="sr-only"
          />
        </label>
      ) : (
        <p className="text-sm text-graphite">
          You have added the maximum of {marketplacePolicy.maxListingPhotos} photographs.
        </p>
      )}

      <p className="text-caption text-stone">
        Photograph the garment itself in good daylight: front, back, and a close-up of the work. Location data
        is removed from every upload. The first photograph is the cover.
      </p>
    </div>
  );
}
