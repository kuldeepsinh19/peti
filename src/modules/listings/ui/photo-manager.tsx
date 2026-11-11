"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { marketplacePolicy } from "@/config/marketplace-policy";
import { fileUrl } from "@/modules/media";
import type { ActionResult } from "@/shared/contracts/action-result";
import { Button } from "@/shared/ui/button";
import { FormMessage } from "@/shared/ui/form";
import type { ListingPhoto } from "../application/ports";

/**
 * Uploads photographs one at a time through a Server Action. The server checks the file's content,
 * strips metadata (including location) and re-encodes it; nothing here is trusted.
 */
export function PhotoManager({
  outfitId,
  photos,
  upload,
  remove,
}: {
  outfitId: string;
  photos: ListingPhoto[];
  upload: (formData: FormData) => Promise<ActionResult<{ id: string }>>;
  remove: (formData: FormData) => Promise<ActionResult<undefined>>;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const full = photos.length >= marketplacePolicy.maxListingPhotos;

  async function onUpload() {
    const file = input.current?.files?.[0];
    if (!file) {
      setError("Choose a photograph first.");
      return;
    }
    if (file.size > marketplacePolicy.maxUploadBytes) {
      setError(`Photographs must be smaller than ${marketplacePolicy.maxUploadBytes / 1024 / 1024} MB.`);
      return;
    }
    setBusy(true);
    setError(null);
    const data = new FormData();
    data.set("outfitId", outfitId);
    data.set("photo", file);
    data.set("altText", alt);
    const result = await upload(data);
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setAlt("");
    if (input.current) input.current.value = "";
    router.refresh();
  }

  async function onRemove(photoId: string) {
    const data = new FormData();
    data.set("outfitId", outfitId);
    data.set("photoId", photoId);
    const result = await remove(data);
    if (!result.ok) setError(result.error.message);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <FormMessage>{error}</FormMessage>
      {photos.length > 0 ? (
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {photos.map((p, i) => (
            <li key={p.id} className="flex flex-col gap-2">
              <div className="relative aspect-[3/4] overflow-hidden bg-sand">
                <Image
                  src={fileUrl(p.storageKey)}
                  alt={p.altText}
                  fill
                  sizes="25vw"
                  className="object-cover"
                />
              </div>
              <div className="flex items-center justify-between text-caption text-graphite">
                <span>{i === 0 ? "Cover" : `Photo ${i + 1}`}</span>
                <button type="button" onClick={() => onRemove(p.id)} className="text-burgundy underline">
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-graphite">No photographs yet. The first one becomes the cover.</p>
      )}
      {!full ? (
        <div className="grid max-w-xl gap-4 border-t border-rule pt-6">
          <label className="flex flex-col gap-2">
            <span className="eyebrow text-graphite">Photograph (JPEG, PNG or WebP)</span>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow text-graphite">Describe it for screen readers</span>
            <input
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="Front of the sherwani on a hanger"
              className="border-0 border-b border-rule-strong bg-transparent py-2 focus:border-ink focus:outline-none"
            />
          </label>
          <div>
            <Button onClick={onUpload} pending={busy}>
              Upload photograph
            </Button>
          </div>
          <p className="text-caption text-stone">
            Photograph the garment itself in good light. Location data is removed from every upload.
          </p>
        </div>
      ) : (
        <p className="text-sm text-graphite">
          You have added the maximum of {marketplacePolicy.maxListingPhotos} photographs.
        </p>
      )}
    </div>
  );
}
