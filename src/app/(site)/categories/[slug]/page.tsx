import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { container } from "@/composition/container";
import { FilterRow } from "@/modules/search/ui/filter-row";
import { Page, SectionIndex } from "@/shared/ui/layout";
import { Results } from "../../explore/results";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const category = (await container().search.categories()).find((c) => c.slug === slug);
  return category ? { title: category.name, description: category.description ?? undefined } : {};
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const { search } = container();
  const [categories, localities] = await Promise.all([search.categories(), search.localities()]);
  const index = categories.findIndex((c) => c.slug === slug);
  const category = categories[index];
  if (!category) notFound();

  const { query, result } = search.explore({ ...(await searchParams), category: slug });
  const explored = await result;
  return (
    <Page className="pt-10 lg:pt-14">
      <header className="mb-8 grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <SectionIndex index={index + 1}>
            {category.audience === "MEN" ? "Menswear" : "Womenswear"}
          </SectionIndex>
          <h1 className="mt-4 text-display-lg">{category.name}</h1>
        </div>
        {category.description ? (
          <p className="self-end text-lg text-graphite lg:col-span-4">{category.description}</p>
        ) : null}
      </header>
      <FilterRow
        query={query}
        categories={categories}
        localities={localities}
        action={`/categories/${slug}`}
        lockCategory={slug}
        total={explored.total}
      />
      <Results query={query} result={explored} basePath={`/categories/${slug}`} />
    </Page>
  );
}
