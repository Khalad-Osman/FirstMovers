"use client";

import { useActionState, useState } from "react";
import { startDiscovery, type StartDiscoveryState } from "./actions";
import { SECTORS, SECTOR_LABEL, type Sector } from "@/lib/sector";

export function StartDiscovery({ cap, sourcesPerCandidate, topK, monthCredits, budget }: { cap: number; sourcesPerCandidate: number; topK: number; monthCredits: number; budget: number }) {
  const [state, action, pending] = useActionState<StartDiscoveryState, FormData>(startDiscovery, undefined);
  const [confirming, setConfirming] = useState(false);
  const [sector, setSector] = useState<Sector>("industrial");
  const firecrawlLow = cap * 10;
  const firecrawlHigh = cap * 13;
  const screeningCalls = Math.ceil(topK / 10);

  return (
    <div className="grid gap-3 border border-line bg-panel p-4">
      {!confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" onClick={() => setConfirming(true)}>
            Run discovery
          </button>
          <span className="text-[0.875rem] text-meta">Turns stored signals into briefs. You&apos;ll confirm the cost first.</span>
        </div>
      ) : (
        <form action={action} className="grid gap-3">
          <p className="font-semibold">Run discovery now?</p>
          <fieldset className="flex flex-wrap gap-4">
            <legend className="label mb-1">Sector</legend>
            {SECTORS.map((s) => (
              <label key={s} className="inline-flex items-center gap-2 text-[0.9375rem]">
                <input type="radio" name="sector" value={s} checked={sector === s} onChange={() => setSector(s)} />
                {SECTOR_LABEL[s]}
              </label>
            ))}
          </fieldset>
          <p className="text-[0.875rem] text-meta">
            {sector === "retail"
              ? "Retail: stores, restaurants, grocery, franchises, cannabis stores, dealerships, gyms and personal services, clinics. Candidates come from store fit-out, sign and change-of-use permits and retail grants."
              : "Industrial: manufacturers, warehouses, distributors and logistics. Candidates come from permits, grants, contract awards, announcements and environmental approvals."}
          </p>
          <ul className="mono grid gap-1 text-[0.875rem]">
            <li>Screens the top {topK} rule-scored candidates: about {screeningCalls} cheap-model calls.</li>
            <li>Researches up to {cap} compan{cap === 1 ? "y" : "ies"}, at most {sourcesPerCandidate} sources each: about {firecrawlLow}–{firecrawlHigh} Firecrawl credits.</li>
            <li>Analyzes each researched company: {cap}–{cap * 2} strong-model calls.</li>
            <li>Skips companies analyzed in the skip window. Runs in the background; you can leave the page.</li>
            <li>
              This month so far: ~{monthCredits} of {budget} budget credits.{" "}
              {monthCredits + firecrawlHigh > budget ? <strong>This run could exceed the monthly budget.</strong> : `About ${budget - monthCredits} left.`}
            </li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className="btn btn-primary">
              {pending ? "Starting…" : "Confirm and run"}
            </button>
            <button type="button" className="btn" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {state?.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
    </div>
  );
}
