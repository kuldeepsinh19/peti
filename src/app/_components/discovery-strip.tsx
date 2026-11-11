import { occasions } from "@/config/site";
import { Page } from "@/shared/ui/layout";

/**
 * The landing page's search row: a plain GET form to /explore, so it works without JavaScript and every
 * search is a shareable URL.
 */
export function DiscoveryStrip() {
  return (
    <section aria-label="Find an outfit" className="border-y border-ink bg-ivory">
      <Page>
        <form action="/explore" method="get" className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr_1fr_auto]">
          <label className="flex flex-col gap-1 border-b border-rule py-4 md:border-r md:border-b-0 md:pr-6">
            <span className="eyebrow text-graphite">Looking for</span>
            <input
              type="search"
              name="q"
              placeholder="Sherwani, Banarasi, pastel lehenga…"
              className="border-0 bg-transparent p-0 font-display text-xl placeholder:text-stone focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 border-b border-rule py-4 md:border-r md:border-b-0 md:px-6">
            <span className="eyebrow text-graphite">Occasion</span>
            <select
              name="occasion"
              defaultValue=""
              className="appearance-none border-0 bg-transparent p-0 font-display text-xl focus:outline-none"
            >
              <option value="">Any ceremony</option>
              {occasions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 border-b border-rule py-4 md:border-r md:border-b-0 md:px-6">
            <span className="eyebrow text-graphite">Wearing it on</span>
            <input
              type="date"
              name="from"
              className="border-0 bg-transparent p-0 font-display text-xl focus:outline-none"
            />
          </label>
          <div className="flex items-center py-4 md:pl-6">
            <button
              type="submit"
              className="h-12 w-full bg-burgundy px-8 text-sm font-medium tracking-[0.04em] text-paper hover:bg-burgundy-light md:w-auto"
            >
              Search
            </button>
          </div>
        </form>
      </Page>
    </section>
  );
}
