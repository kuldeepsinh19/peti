import type { Metadata } from "next";
import { container } from "@/composition/container";
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
  const [explored, categories, localities] = await Promise.all([
    result,
    search.categories(),
    search.localities(),
  ]);
  return (
    <Page className="pt-10 lg:pt-14">
      <header className="mb-8 grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <SectionIndex>Explore · Ahmedabad</SectionIndex>
          <h1 className="mt-4 text-display-lg">
            The <span className="display-italic">wardrobe</span>
          </h1>
        </div>
        <p className="self-end text-graphite lg:col-span-4">
          Every piece is owned by someone in the city, photographed by them and measured by them. Choose your
          date to see only what is free.
        </p>
      </header>
      <FilterRow query={query} categories={categories} localities={localities} total={explored.total} />
      <Results query={query} result={explored} basePath="/explore" />
    </Page>
  );
}
