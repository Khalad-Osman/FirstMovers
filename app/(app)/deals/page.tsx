import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getPastDealsForFit } from "@/lib/data/deals";
import { COMPANY_TYPES, DEAL_TYPES, REGIONS } from "@/lib/research/filters";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { ActionButton } from "@/components/action-button";
import { deletePastDeal } from "./actions";
import { DealsUploader } from "./uploader";

export const metadata: Metadata = { title: "Past deals · First Movers" };
export const maxDuration = 60; // PDF reading

export default async function DealsPage() {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    return (
      <div className="grid gap-6">
        <PageHeader title="Past deals" description="The team's track record, used to rate briefs on past-deal fit." />
        <p className="border border-dashed border-[#9ca3af] bg-panel px-5 py-6 text-[0.9375rem]">
          Past deals are confidential and visible to admins only. Briefs show their past-deal fit level to everyone.
        </p>
      </div>
    );
  }

  const deals = await getPastDealsForFit();
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Past deals"
        description="Your track record, used to rate each brief on past-deal fit (company type, region, deal type and size). Admins only. The fit is separate from the signal rating."
      />
      <DealsUploader />

      <section className="grid gap-2">
        <h2 className="label border-b border-line pb-1.5">
          Saved deals · <span className="mono">{deals.length}</span>
        </h2>
        {deals.length === 0 ? (
          <p className="text-meta">No past deals yet. Upload a CSV or PDF to start rating briefs on past-deal fit.</p>
        ) : (
          <div className="overflow-x-auto border border-line">
            <table className="w-full min-w-[900px] border-collapse text-left text-[0.875rem]">
              <thead className="bg-panel">
                <tr>
                  {["Occupier", "Company type", "Location", "Deal type", "Sq ft", "Clear", "Date", "Source", ""].map((h) => (
                    <th key={h} className="label px-3 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => (
                  <tr key={d.id} className="border-t border-line align-top">
                    <td className="px-3 py-2 font-semibold">
                      {d.occupier}
                      {d.notes && <div className="font-normal text-meta">{d.notes}</div>}
                    </td>
                    <td className="px-3 py-2">{d.companyType ? COMPANY_TYPES[d.companyType].label : "—"}</td>
                    <td className="px-3 py-2">{d.municipality ?? (d.region ? REGIONS[d.region].label : "—")}</td>
                    <td className="px-3 py-2">{d.dealType ? DEAL_TYPES[d.dealType] : "—"}</td>
                    <td className="mono px-3 py-2">{d.sizeSqft ? Math.round(d.sizeSqft).toLocaleString("en-CA") : "—"}</td>
                    <td className="mono px-3 py-2">{d.clearHeightFt ? `${d.clearHeightFt} ft` : "—"}</td>
                    <td className="mono px-3 py-2">{d.dealDate ? formatDate(d.dealDate) : "—"}</td>
                    <td className="px-3 py-2 text-meta">
                      {d.source.toUpperCase()}
                      {d.sourceFile && <div className="max-w-40 truncate">{d.sourceFile}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <ActionButton action={deletePastDeal.bind(null, d.id)} label="Delete" pendingLabel="Deleting…" confirmLabel="Confirm delete" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
