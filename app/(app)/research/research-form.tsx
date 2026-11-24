"use client";

import { useActionState, useState } from "react";
import { COMPANY_TYPES, COMPANY_TYPE_KEYS, DEAL_TYPES, DEAL_TYPE_KEYS, REGIONS, REGION_KEYS } from "@/lib/research/filters";
import { startResearch, type StartState } from "./actions";
import { SECTORS, SECTOR_LABEL, type Sector } from "@/lib/sector";

type Props = {
  initialMode?: "company" | "theme";
  initialQuery?: string;
  companyId?: string; // re-analysis of an existing company
  compact?: boolean;
  initialSector?: Sector;
};

const HINT = {
  company: "Runs 3 searches and reads up to 5 pages. Uses about 10–13 Firecrawl credits.",
  theme: "Runs 1 search and lists the results. Uses about 2 Firecrawl credits. Nothing is read or analyzed.",
};

export function ResearchForm({ initialMode = "company", initialQuery = "", companyId, compact, initialSector = "industrial" }: Props) {
  const [state, action, pending] = useActionState<StartState, FormData>(startResearch, undefined);
  const [mode, setMode] = useState<"company" | "theme">(companyId ? "company" : initialMode);
  const [sector, setSector] = useState<Sector>(initialSector);

  return (
    <form action={action} className={`grid gap-3 ${compact ? "" : "border border-line bg-panel p-4"}`}>
      {!companyId && !compact && (
        <fieldset className="flex flex-wrap gap-4">
          <legend className="label mb-1">Research a</legend>
          {(["company", "theme"] as const).map((m) => (
            <label key={m} className="inline-flex items-center gap-2 text-[0.9375rem]">
              <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
              {m === "company" ? "Company" : "Theme"}
            </label>
          ))}
        </fieldset>
      )}
      {(companyId || compact) && <input type="hidden" name="mode" value="company" />}
      {compact ? (
        <input type="hidden" name="sector" value={sector} />
      ) : (
        <fieldset className="flex flex-wrap gap-4">
          <legend className="label mb-1">Sector</legend>
          {SECTORS.map((s) => (
            <label key={s} className="inline-flex items-center gap-2 text-[0.9375rem]">
              <input type="radio" name="sector" value={s} checked={sector === s} onChange={() => setSector(s)} />
              {SECTOR_LABEL[s]}
            </label>
          ))}
        </fieldset>
      )}
      {companyId && <input type="hidden" name="companyId" value={companyId} />}

      <div className="flex flex-wrap gap-2">
        <label className="grid min-w-0 flex-1 basis-72 gap-1">
          <span className="field-label">{mode === "company" ? "Company name" : "Theme"}</span>
          <input
            name="query"
            required
            minLength={2}
            maxLength={200}
            defaultValue={initialQuery}
            readOnly={Boolean(companyId)}
            placeholder={
              mode === "company"
                ? "e.g. full legal name, Inc. / Ltd. included"
                : sector === "retail"
                  ? "e.g. quick-service restaurant expansion Ontario"
                  : "e.g. switchgear manufacturing Ontario"
            }
            className="input"
          />
        </label>
        <button type="submit" disabled={pending} className="btn btn-primary self-end">
          {pending ? "Starting…" : companyId ? "Re-research and analyze" : mode === "company" ? "Research company" : "Search theme"}
        </button>
      </div>
      <p className="text-[0.8125rem] text-meta">{HINT[mode]}</p>
      {!compact && !companyId && <FilterFields mode={mode} sector={sector} />}
      {state?.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
    </form>
  );
}

function Chips({ name, title, options }: { name: string; title: string; options: { value: string; label: string }[] }) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="field-label mb-1">{title}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="inline-flex cursor-pointer items-center gap-1.5 rounded-[3px] border border-line bg-white px-2.5 py-1.5 text-[0.9375rem]">
            <input type="checkbox" name={name} value={o.value} className="h-4 w-4" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function FilterFields({ mode, sector }: { mode: "company" | "theme"; sector: Sector }) {
  return (
    <details className="group border-t border-line pt-3">
      <summary className="cursor-pointer list-none text-[0.9375rem] font-semibold">
        <span className="inline-block transition-transform group-open:rotate-90">▸</span> Filters (optional)
      </summary>
      <div className="mt-3 grid gap-4">
        <p className="text-[0.8125rem] text-meta">
          {mode === "theme"
            ? "Region and company type narrow the search (same cost). Every filter is then checked against the results."
            : "Filters don't change the search. After analysis, the brief is checked against each one."}{" "}
          Property criteria are checked against what the sources state, never searched for or assumed.
        </p>
        <Chips name="filter_region" title="Region" options={REGION_KEYS.map((k) => ({ value: k, label: REGIONS[k].label }))} />
        <Chips
          name="filter_company_type"
          title="Company type"
          options={COMPANY_TYPE_KEYS.filter((k) => COMPANY_TYPES[k].sector === sector || COMPANY_TYPES[k].sector === "both").map((k) => ({ value: k, label: COMPANY_TYPES[k].label }))}
        />
        <Chips name="filter_deal_type" title="Deal type" options={DEAL_TYPE_KEYS.map((k) => ({ value: k, label: DEAL_TYPES[k] }))} />
        <fieldset className="grid gap-1.5">
          <legend className="field-label mb-1">Property criteria · checked against sources, not searched</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["filter_min_sqft", "Min sq ft"],
              ["filter_max_sqft", "Max sq ft"],
              ["filter_min_clear_height", "Min clear height (ft)"],
            ].map(([name, label]) => (
              <label key={name} className="grid gap-1">
                <span className="text-[0.875rem]">{label}</span>
                <input type="text" inputMode="numeric" name={name} pattern="[0-9, ]*" className="input mono" autoComplete="off" />
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </details>
  );
}
