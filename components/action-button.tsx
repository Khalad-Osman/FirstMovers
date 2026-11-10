"use client";

import { useState, useTransition } from "react";

type Props = {
  action: () => Promise<void>;
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
        await action();
        setConfirming(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
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
