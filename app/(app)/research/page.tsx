import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Live Research · First Movers" };

export default function ResearchPage() {
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Live Research"
        description="Research a company or theme on demand, review the collected sources, then analyze them into a brief."
      />
      <div className="border border-dashed border-[#9ca3af] bg-panel px-5 py-6">
        <p className="font-semibold">Not available yet.</p>
        <p className="mt-1 text-meta">Live Research is being built next. Nothing runs from this page for now.</p>
      </div>
    </div>
  );
}
