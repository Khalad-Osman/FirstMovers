"use client";

import { useState, useTransition } from "react";
import { checkFirecrawlBalance, type BalanceResult } from "./actions";

const date = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date(iso)) : "—");

export function FirecrawlBalance() {
  const [result, setResult] = useState<BalanceResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-2">
      <button type="button" className="btn w-fit" disabled={pending} onClick={() => start(async () => setResult(await checkFirecrawlBalance()))}>
        {pending ? "Checking…" : "Check Firecrawl balance"}
      </button>
      {result?.ok && (
        <p className="mono text-[0.875rem]">
          Actual: {result.remaining.toLocaleString("en-CA")} of {result.plan.toLocaleString("en-CA")} credits left · period {date(result.periodStart)} to {date(result.periodEnd)}
        </p>
      )}
      {result && !result.ok && (
        <p role="alert" className="form-error">
          {result.error}
        </p>
      )}
    </div>
  );
}
