"use client";

import { useActionState, useState } from "react";
import { startResearch, type StartState } from "./actions";

type Props = {
  initialMode?: "company" | "theme";
  initialQuery?: string;
  companyId?: string; // re-analysis of an existing company
  compact?: boolean;
};

const HINT = {
  company: "Runs 3 searches and reads up to 5 pages. Uses about 10–13 Firecrawl credits.",
  theme: "Runs 1 search and lists the results. Uses about 2 Firecrawl credits. Nothing is read or analyzed.",
};

export function ResearchForm({ initialMode = "company", initialQuery = "", companyId, compact }: Props) {
  const [state, action, pending] = useActionState<StartState, FormData>(startResearch, undefined);
  const [mode, setMode] = useState<"company" | "theme">(companyId ? "company" : initialMode);

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
            placeholder={mode === "company" ? "e.g. full legal name, Inc. / Ltd. included" : "e.g. switchgear manufacturing Ontario"}
            className="input"
          />
        </label>
        <button type="submit" disabled={pending} className="btn btn-primary self-end">
          {pending ? "Starting…" : companyId ? "Re-research and analyze" : mode === "company" ? "Research company" : "Search theme"}
        </button>
      </div>
      <p className="text-[0.8125rem] text-meta">{HINT[mode]}</p>
      {state?.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
    </form>
  );
}
