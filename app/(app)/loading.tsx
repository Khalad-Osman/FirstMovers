export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="grid gap-3">
      <div className="h-7 w-56 animate-pulse rounded-sm bg-panel" />
      <div className="h-24 animate-pulse rounded-sm bg-panel" />
      <div className="h-24 animate-pulse rounded-sm bg-panel" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
