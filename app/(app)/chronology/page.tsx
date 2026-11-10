import type { Metadata } from "next";
import Link from "next/link";
import { getChronology } from "@/lib/data/briefs";
import { PageHeader } from "@/components/page-header";
import { RelevanceBadge } from "@/components/badges";

export const metadata: Metadata = { title: "Chronology · First Movers" };

export default async function ChronologyPage() {
  const items = await getChronology();

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Chronology"
        description="Dated evidence from saved briefs, newest first. Uses the event date where known, otherwise the publication date."
      />

      {items.length === 0 ? (
        <div className="border border-dashed border-[#9ca3af] bg-panel px-5 py-6">
          <p className="font-semibold">No dated evidence yet.</p>
          <p className="mt-1 text-meta">Evidence appears here once briefs are saved to the feed. Samples are not included.</p>
        </div>
      ) : (
        <ol className="grid">
          {items.map((item) => (
            <li
              key={`${item.companyId}|${item.url}`}
              className="grid gap-x-6 gap-y-1 border-b border-line py-3 sm:grid-cols-[140px_minmax(0,1fr)]"
            >
              <div className="mono text-[0.875rem]">
                {item.date}
                <div className="text-[0.75rem] text-meta">{item.dateKind === "event" ? "Event date" : "Published"}</div>
              </div>
              <div className="grid min-w-0 gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/briefs/${item.briefId}`} className="font-semibold hover:underline">
                    {item.companyName}
                  </Link>
                  <RelevanceBadge relevance={item.relevance} />
                </div>
                <p>{item.finding}</p>
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="link w-fit text-[0.8125rem]">
                  {item.publisher}
                </a>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
