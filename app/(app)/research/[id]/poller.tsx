"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Re-renders the page every few seconds while a job is running. Stops as soon
// as the server reports a finished state (the component unmounts).
export function Poller({ intervalMs = 3000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs]);
  return null;
}
