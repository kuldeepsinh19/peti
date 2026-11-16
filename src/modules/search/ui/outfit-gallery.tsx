"use client";

import Image from "next/image";
import { useState } from "react";
import { fileUrl } from "@/modules/media";
import { cn } from "@/shared/ui/cn";

/**
 * The outfit's photographs: one large image and a strip of the rest. Thumbnails are buttons (keyboard and
 * screen-reader friendly); the left and right arrow keys move between photographs.
 */
export function OutfitGallery({
  title,
  photos,
}: {
  title: string;
  photos: ReadonlyArray<{ key: string; alt: string }>;
}) {
  const [index, setIndex] = useState(0);
  if (photos.length === 0) {
    return (
      <div className="flex aspect-[3/4] items-center justify-center bg-sand">
        <p className="eyebrow text-graphite">No photograph yet</p>
      </div>
    );
  }
  const current = photos[Math.min(index, photos.length - 1)]!;
  const go = (next: number) => setIndex((next + photos.length) % photos.length);

  return (
    <div
      className="flex flex-col gap-3"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(index + 1);
        if (e.key === "ArrowLeft") go(index - 1);
      }}
    >
      <figure className="relative aspect-[3/4] overflow-hidden bg-sand">
        <Image
          key={current.key}
          src={fileUrl(current.key)}
          alt={current.alt || title}
          fill
          priority={index === 0}
          sizes="(min-width: 64rem) 55vw, 100vw"
          className="object-cover"
        />
        {photos.length > 1 ? (
          <figcaption className="absolute right-0 bottom-0 bg-paper/90 px-3 py-1 eyebrow text-ink numeral">
            {index + 1} / {photos.length}
          </figcaption>
        ) : null}
      </figure>
      {photos.length > 1 ? (
        <ul aria-label="All photographs" className="grid grid-cols-5 gap-2 sm:grid-cols-6">
          {photos.map((photo, i) => (
            <li key={photo.key}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show photograph ${i + 1} of ${photos.length}`}
                aria-current={i === index ? "true" : undefined}
                className={cn(
                  "relative block aspect-[3/4] w-full overflow-hidden bg-sand outline-offset-2",
                  i === index ? "outline-2 outline-ink" : "opacity-70 hover:opacity-100",
                )}
              >
                <Image src={fileUrl(photo.key)} alt="" fill sizes="10vw" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
