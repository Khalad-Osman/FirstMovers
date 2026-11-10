"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="grid gap-3 border-l-4 border-[var(--error-fg)] bg-[var(--error-bg)] px-4 py-4">
      <p className="font-semibold text-[var(--error-fg)]">This page couldn&apos;t load.</p>
      <p>{error.message || "An unexpected error occurred."} Check your connection, then try again.</p>
      <button type="button" className="btn w-fit" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
