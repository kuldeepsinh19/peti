import { Page } from "@/shared/ui/layout";

/** A quiet placeholder while a page's data loads (announced to screen readers once). */
export function PageLoading({ label = "Loading", grid = false }: { label?: string; grid?: boolean }) {
  return (
    <Page className="py-10">
      <div role="status" aria-live="polite" className="flex flex-col gap-6">
        <span className="sr-only">{label}…</span>
        <div aria-hidden className="h-4 w-32 animate-pulse bg-sand motion-reduce:animate-none" />
        <div aria-hidden className="h-10 w-2/3 max-w-xl animate-pulse bg-sand motion-reduce:animate-none" />
        {grid ? (
          <div aria-hidden className="mt-4 grid grid-cols-2 gap-6 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="aspect-[3/4] animate-pulse bg-sand motion-reduce:animate-none" />
            ))}
          </div>
        ) : (
          <div aria-hidden className="flex flex-col gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-16 animate-pulse bg-sand motion-reduce:animate-none" />
            ))}
          </div>
        )}
      </div>
    </Page>
  );
}
