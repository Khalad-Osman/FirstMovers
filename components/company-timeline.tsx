import type { TimelineItem } from "@/lib/brief/timeline";
import { formatDate } from "@/lib/format";

// A company's dated history: Signal evidence from all brief versions plus its
// stored public records, oldest first.
export function CompanyTimeline({ items }: { items: TimelineItem[] }) {
  return (
    <section className="grid min-w-0 content-start gap-3">
      <h2 className="border-b border-line pb-1.5 text-[0.8125rem] font-semibold tracking-[0.06em] text-meta uppercase">Timeline</h2>
      <p className="text-[0.8125rem] text-meta">
        This company&apos;s dated history, oldest first: Signal evidence from every brief version, plus permits, grants and contract awards on file (including ones no brief has cited yet).
      </p>
      {items.length === 0 ? (
        <p className="text-meta">No dated signals or public records yet.</p>
      ) : (
        <ol className="grid border-l-2 border-line pl-4">
          {items.map((item) => (
            <li key={item.url} className="relative grid gap-0.5 py-2.5">
              <span aria-hidden="true" className={`absolute top-4 -left-[1.3rem] h-2.5 w-2.5 rounded-full ${item.kind === "evidence" ? "bg-[var(--accent)]" : "border-2 border-[var(--accent)] bg-white"}`} />
              <div className="mono flex flex-wrap items-center gap-x-3 text-[0.875rem]">
                <span className="font-semibold">{formatDate(item.date)}</span>
                <span className="text-[0.75rem] text-meta">{item.dateKind}</span>
                <span className="text-[0.75rem] text-meta">
                  {item.kind === "evidence" ? `cited in version ${item.versions.join(", ")}` : "public record, not yet cited"}
                </span>
              </div>
              <p>{item.text}</p>
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="link w-fit text-[0.8125rem]">
                {item.publisher}
              </a>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
