import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSample, SAMPLE_BRIEFS } from "@/lib/samples";
import { BriefView } from "@/components/brief-view";

export function generateStaticParams() {
  return SAMPLE_BRIEFS.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: PageProps<"/samples/[slug]">): Promise<Metadata> {
  const sample = getSample((await params).slug);
  return { title: `Sample: ${sample?.analysis.company.name ?? "Brief"} · First Movers` };
}

export default async function SamplePage({ params }: PageProps<"/samples/[slug]">) {
  const sample = getSample((await params).slug);
  if (!sample) notFound();

  return (
    <div className="grid min-w-0 gap-4">
      <Link href="/?samples=1" className="link w-fit text-[0.875rem]">
        ← Opportunity Feed
      </Link>
      <BriefView
        analysis={sample.analysis}
        companyName={sample.analysis.company.name}
        isSample
        analyzedAt={sample.analyzedAt}
        origin={sample.origin}
        surfacedBy={sample.surfacedBy}
        sector={sample.sector}
      />
    </div>
  );
}
