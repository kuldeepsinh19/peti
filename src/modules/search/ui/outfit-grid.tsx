import Image from "next/image";
import Link from "next/link";
import { fileUrl } from "@/modules/media";
import { formatInr } from "@/shared/domain/money";
import { cn } from "@/shared/ui/cn";
import { sizeLabel } from "@/shared/ui/labels";
import type { OutfitCard } from "../application/ports";

/**
 * The listing rhythm: one large piece followed by two small, then a row of three — never a uniform grid.
 * Spans on the 12-column desktop grid repeat every six items.
 */
const DESKTOP_SPANS = [
  "lg:col-span-6",
  "lg:col-span-3",
  "lg:col-span-3",
  "lg:col-span-4",
  "lg:col-span-4",
  "lg:col-span-4",
];

export function OutfitGrid({ items, priority = false }: { items: OutfitCard[]; priority?: boolean }) {
  return (
    <ul className="grid grid-cols-2 gap-x-(--spacing-gutter) gap-y-12 lg:grid-cols-12">
      {items.map((item, i) => (
        <li key={item.id} className={cn(i % 5 === 0 ? "col-span-2" : "col-span-1", DESKTOP_SPANS[i % 6])}>
          <OutfitCardView item={item} large={i % 6 === 0} priority={priority && i < 3} />
        </li>
      ))}
    </ul>
  );
}

export function OutfitCardView({
  item,
  large,
  priority,
}: {
  item: OutfitCard;
  large?: boolean;
  priority?: boolean;
}) {
  return (
    <Link href={`/outfits/${item.slug}`} className="group block no-underline">
      <div className="relative aspect-[3/4] overflow-hidden bg-sand">
        {item.photoKey ? (
          <Image
            src={fileUrl(item.photoKey)}
            alt={item.photoAlt ?? item.title}
            fill
            priority={priority}
            sizes={large ? "(min-width: 64rem) 50vw, 100vw" : "(min-width: 64rem) 25vw, 50vw"}
            className="object-cover transition-transform duration-700 ease-(--ease-editorial) group-hover:scale-[1.02]"
          />
        ) : null}
      </div>
      <p className="mt-3 eyebrow text-graphite">
        {item.categoryName} · {sizeLabel[item.sizeLabel] ?? item.sizeLabel} · {item.localityName}
      </p>
      <h3 className={cn("mt-1 leading-tight group-hover:text-burgundy", large ? "text-3xl" : "text-xl")}>
        {item.title}
      </h3>
      <p className="mt-1 text-sm text-graphite numeral">
        <span className="text-ink">{formatInr(item.pricePaise)}</span> for {item.priceDays} days · deposit{" "}
        {formatInr(item.depositPaise)}
      </p>
    </Link>
  );
}
