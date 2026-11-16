"use client";

import { useState, useTransition } from "react";

// Server actions return { error } for expected failures: in production, Next
// replaces a thrown error's message with a generic one (React error #441).
export type ActionResult = { error: string } | void | undefined;

type Props = {
  action: () => Promise<ActionResult>;
  label: string;
  pendingLabel: string;
  confirmLabel?: string; // when set, the first click asks for confirmation inline
  className?: string;
};

export function ActionButton({ action, label, pendingLabel, confirmLabel, className = "btn" }: Props) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result?.error) {
          setError(result.error);
          return;
        }
        setConfirming(false);
      } catch {
        // Unexpected server error: production hides the message, so don't show React's code.
        setError("Something went wrong on the server. Try again, or check the Vercel logs.");
      }
    });
  }

  if (confirming) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <button type="button" className={className} disabled={pending} onClick={run}>
          {pending ? pendingLabel : confirmLabel}
        </button>
        <button type="button" className="btn" disabled={pending} onClick={() => setConfirming(false)}>
          Cancel
        </button>
        {error && <span role="alert" className="text-sm text-[var(--error-fg)]">{error}</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() => (confirmLabel ? setConfirming(true) : run())}
      >
        {pending ? pendingLabel : label}
      </button>
      {error && <span role="alert" className="text-sm text-[var(--error-fg)]">{error}</span>}
    </span>
  );
}
