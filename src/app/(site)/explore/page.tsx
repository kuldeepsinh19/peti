import type { Metadata } from "next";
import { container } from "@/composition/container";
import { listAnOutfit } from "@/config/site";
import { getActor } from "@/composition/session";
import { CategoryStrip } from "@/modules/search/ui/category-strip";
import { FilterRow } from "@/modules/search/ui/filter-row";
import { Page, SectionIndex } from "@/shared/ui/layout";
import { Results } from "./results";

export const metadata: Metadata = {
  title: "Explore outfits",
  description: "Sherwanis, Jodhpuri suits, lehengas and sarees to rent from people in Ahmedabad.",
};
export const dynamic = "force-dynamic";

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { search } = container();
  const { query, result } = search.explore(await searchParams);
  const [explored, categories, localities, actor] = await Promise.all([
    result,
    search.categories(),
    search.localities(),
    getActor(),
  ]);
  return (
    <Page className="pt-10 lg:pt-14">
      <header className="mb-8 grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <SectionIndex>Explore outfits · Ahmedabad</SectionIndex>
          <h1 className="mt-4 text-display-lg">
            The city&rsquo;s <span className="display-italic">wardrobe</span>
          </h1>
        </div>
        <div className="flex flex-col gap-3 self-end lg:col-span-4">
          <p className="text-graphite">
            Every piece is owned by someone in the city, photographed by them and measured by them. Choose
            your date to see only what is free.
          </p>
          <p className="text-sm text-graphite">
            Own something worth wearing again?{" "}
            <a href={listAnOutfit.href(actor !== null)}>{listAnOutfit.label}</a>
          </p>
        </div>
      </header>
      <CategoryStrip categories={categories} active={query.category} />
      <FilterRow query={query} categories={categories} localities={localities} total={explored.total} />
      <Results query={query} result={explored} basePath="/explore" />
    </Page>
  );
}
