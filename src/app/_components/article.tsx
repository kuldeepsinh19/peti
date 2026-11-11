import type { ReactNode } from "react";
import { Page, SectionIndex } from "@/shared/ui/layout";

/**
 * Long-form editorial page: title block on a 12-column grid, a narrow contents column on desktop and a
 * prose column of comfortable measure.
 */
export function Article({
  eyebrow,
  title,
  lede,
  sections,
  updated,
  aside,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  sections: ReadonlyArray<{ id: string; title: string; body: ReactNode }>;
  updated?: string;
  aside?: ReactNode;
}) {
  return (
    <Page className="page-grid pt-12 lg:pt-20">
      <header className="col-span-4 border-b border-ink pb-10 lg:col-span-10">
        <SectionIndex>{eyebrow}</SectionIndex>
        <h1 className="mt-5 text-display-lg">{title}</h1>
        {lede ? (
          <p className="mt-8 max-w-2xl text-xl leading-relaxed text-graphite lg:ml-[20%]">{lede}</p>
        ) : null}
        {updated ? <p className="mt-6 eyebrow text-stone lg:ml-[20%]">Last updated {updated}</p> : null}
      </header>
      <nav aria-label="On this page" className="col-span-4 hidden pt-10 lg:col-span-3 lg:block">
        <ol className="sticky top-8 flex flex-col gap-2 border-t border-rule pt-4">
          {sections.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="flex gap-3 text-sm text-graphite no-underline hover:text-ink">
                <span className="text-brass-deep numeral">{String(i + 1).padStart(2, "0")}</span>
                {s.title}
              </a>
            </li>
          ))}
        </ol>
        {aside ? <div className="mt-10">{aside}</div> : null}
      </nav>
      <div className="col-span-4 lg:col-span-7 lg:col-start-5">
        {sections.map((s, i) => (
          <section
            key={s.id}
            id={s.id}
            aria-labelledby={`${s.id}-title`}
            className="scroll-mt-8 border-b border-rule py-10"
          >
            <p className="eyebrow text-brass-deep numeral">{String(i + 1).padStart(2, "0")}</p>
            <h2 id={`${s.id}-title`} className="mt-2 text-display-sm">
              {s.title}
            </h2>
            <div className="prose-peti mt-5">{s.body}</div>
          </section>
        ))}
      </div>
    </Page>
  );
}
