"use client";

import { useActionState, useState } from "react";
import type { EmailPreferences } from "@/lib/data/email";
import { saveEmailPreferences, sendTestEmailAction, type EmailPrefsState, type TestEmailState } from "./email-actions";

const CHOICES: { name: keyof Omit<EmailPreferences, "enabled">; label: string; hint: string }[] = [
  { name: "watchlist_briefs", label: "Watchlist companies", hint: "A new brief for a company on the Watchlist." },
  { name: "strong_signals", label: "Strong Signal briefs", hint: "Any new Strong Signal brief, as soon as it is saved." },
  { name: "weekly_digest", label: "Weekly digest", hint: "Monday morning: every new brief from the past week, strongest first." },
  { name: "discovery_runs", label: "Discovery runs", hint: "When a discovery run finishes, fails or pauses." },
];

export function EmailSettings({ prefs, email, connected }: { prefs: EmailPreferences; email: string | null; connected: boolean }) {
  const [state, action, pending] = useActionState<EmailPrefsState, FormData>(saveEmailPreferences, undefined);
  const [test, testAction, testing] = useActionState<TestEmailState, FormData>(sendTestEmailAction, undefined);
  const [enabled, setEnabled] = useState(prefs.enabled);

  return (
    <section aria-labelledby="email-heading" className="grid gap-4 border border-line bg-panel p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="email-heading" className="label">
          Email notifications
        </h2>
        <span className={`badge ${connected ? "badge-strong" : "badge-stage"}`}>{connected ? "Connected" : "Not connected yet"}</span>
      </div>

      <form action={action} className="grid gap-4">
        <div className="grid gap-1">
          <span className="field-label">Send to</span>
          <span className="mono text-[0.9375rem]">{email ?? "No email on this account"}</span>
        </div>

        <label className="flex items-start gap-2">
          <input type="checkbox" name="enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="mt-1 h-4 w-4" />
          <span className="grid gap-0.5">
            <span className="field-label">Email me notifications</span>
            <span className="field-hint">Turn off to stop every email below. In-app notifications stay on.</span>
          </span>
        </label>

        <fieldset className={`grid gap-3 border-t border-line pt-3 sm:grid-cols-2 ${enabled ? "" : "opacity-60"}`}>
          <legend className="label mb-2">What to email</legend>
          {CHOICES.map((c) => (
            <label key={c.name} className="flex items-start gap-2">
              <input type="checkbox" name={c.name} defaultChecked={prefs[c.name]} className="mt-1 h-4 w-4" />
              <span className="grid gap-0.5">
                <span className="field-label">{c.label}</span>
                <span className="field-hint">{c.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Save email choices"}
          </button>
          <button
            type="submit"
            formAction={testAction}
            className="btn"
            disabled={!connected || testing || !email}
            title={connected ? undefined : "Available once email sending is connected"}
          >
            {testing ? "Sending…" : "Send test email"}
          </button>
          {state?.saved && <span role="status" className="text-[0.9375rem]">Saved.</span>}
          {test?.message && <span role="status" className="text-[0.9375rem]">{test.message}</span>}
        </div>
        {state?.error && (
          <p role="alert" className="form-error">
            {state.error}
          </p>
        )}
        {test?.error && (
          <p role="alert" className="form-error">
            {test.error}
          </p>
        )}
      </form>
    </section>
  );
}
