import Image from "next/image";
import type { ReactNode } from "react";
import portrait from "../../../public/images/editorial/pink-lehenga-studio.jpg";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-page gap-12 page-x pt-10 lg:grid-cols-12 lg:pt-16">
      <div className="lg:col-span-5 lg:col-start-1">{children}</div>
      <figure className="hidden lg:col-span-5 lg:col-start-8 lg:block">
        <div className="relative aspect-[3/4] overflow-hidden bg-sand">
          <Image
            src={portrait}
            alt="A woman in a pink lehenga with a gold-bordered dupatta, photographed in a studio"
            fill
            placeholder="blur"
            sizes="40vw"
            className="object-cover"
          />
        </div>
        <figcaption className="mt-3 text-caption text-stone">
          Editorial photograph: Pratik Patil / Pexels. The model is not a Peti user.
        </figcaption>
      </figure>
    </div>
  );
}
