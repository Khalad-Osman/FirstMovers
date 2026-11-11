"use client";

import { useActionState } from "react";
import { WEEKDAYS } from "@/lib/schedule/plan";
import { saveSettings, type SettingsState } from "./actions";

export type SettingsValues = {
  discovery_cap: number;
  sources_per_candidate: number;
  skip_window_days: number;
  canadabuys_min_value: number;
  screening_model: string | null;
  analysis_model: string | null;
  schedule_ingestion_enabled: boolean;
  schedule_discovery_enabled: boolean;
  discovery_weekday: number;
  firecrawl_monthly_budget: number;
};

type Props = { values: SettingsValues; envModels: { screening: string | null; analysis: string | null }; canEdit: boolean };

export function SettingsForm({ values, envModels, canEdit }: Props) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettings, undefined);
  const disabled = !canEdit || pending;

  return (
    <form action={action} className="grid gap-6">
      <fieldset disabled={disabled} className="grid gap-6">
        <Group title="Discovery caps">
          <NumberField name="discovery_cap" label="Companies researched per run" min={1} max={8} value={values.discovery_cap} hint="1–8. Each costs up to about 13 Firecrawl credits." />
          <NumberField name="sources_per_candidate" label="Sources per company" min={1} max={5} value={values.sources_per_candidate} hint="1–5, including the follow-up search." />
          <NumberField name="skip_window_days" label="Skip window (days)" min={0} max={365} value={values.skip_window_days} hint="Companies analyzed this recently are skipped by discovery." />
        </Group>

        <Group title="Ingestion">
          <NumberField name="canadabuys_min_value" label="CanadaBuys minimum contract value ($)" min={0} max={1_000_000_000} step={1000} value={values.canadabuys_min_value} hint="Awards below this are skipped. Applies from the next ingestion run." />
        </Group>

        <Group title="Models">
          <TextField name="screening_model" label="Screening model (cheap)" value={values.screening_model} hint={`Blank uses the server default: ${envModels.screening ?? "not set"}.`} />
          <TextField name="analysis_model" label="Analysis model (strong)" value={values.analysis_model} hint={`Blank uses the server default: ${envModels.analysis ?? "not set"}.`} />
        </Group>

        <Group title="Schedule">
          <Check name="schedule_ingestion_enabled" label="Run ingestion every day" checked={values.schedule_ingestion_enabled} hint="All structured sources, after their morning refresh. Free." />
          <Check name="schedule_discovery_enabled" label="Run discovery every week" checked={values.schedule_discovery_enabled} hint="Spends Firecrawl and LLM credits within the caps above." />
          <label className="grid gap-1">
            <span className="field-label">Discovery day</span>
            <select name="discovery_weekday" defaultValue={values.discovery_weekday} className="input w-fit">
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <NumberField name="firecrawl_monthly_budget" label="Monthly Firecrawl budget (credits)" min={0} max={100_000} value={values.firecrawl_monthly_budget} hint="Scheduled discovery is skipped if a run could push this month's usage over the budget. Free plan: 1,000/month." />
        </Group>
      </fieldset>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending ? "Saving…" : "Save settings"}
          </button>
          {state?.saved && <span role="status" className="text-[0.9375rem]">Saved.</span>}
          {state?.error && (
            <span role="alert" className="form-error">
              {state.error}
            </span>
          )}
        </div>
      ) : (
        <p className="text-[0.9375rem] text-meta">Only admins can change settings.</p>
      )}
    </form>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <h2 className="label border-b border-line pb-1.5">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function NumberField({ name, label, value, min, max, step = 1, hint }: { name: string; label: string; value: number; min: number; max: number; step?: number; hint?: string }) {
  return (
    <label className="grid content-start gap-1">
      <span className="field-label">{label}</span>
      <input type="number" name={name} defaultValue={value} min={min} max={max} step={step} required className="input mono" />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function TextField({ name, label, value, hint }: { name: string; label: string; value: string | null; hint?: string }) {
  return (
    <label className="grid content-start gap-1">
      <span className="field-label">{label}</span>
      <input type="text" name={name} defaultValue={value ?? ""} maxLength={100} className="input mono" autoComplete="off" />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function Check({ name, label, checked, hint }: { name: string; label: string; checked: boolean; hint?: string }) {
  return (
    <label className="flex items-start gap-2">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-1 h-4 w-4" />
      <span className="grid gap-0.5">
        <span className="field-label">{label}</span>
        {hint && <span className="field-hint">{hint}</span>}
      </span>
    </label>
  );
}
