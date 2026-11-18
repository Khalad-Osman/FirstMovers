import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getProspects } from "@/lib/data/prospects";
import { filterProspects, parseProspectFilters, prospectsCsv } from "@/lib/prospects";
import { todayInToronto } from "@/lib/research/run";

// CSV of the filtered prospect list (same filters as the page). Signed-in users only.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const params: Record<string, string | string[]> = {};
  for (const key of new Set(request.nextUrl.searchParams.keys())) {
    const values = request.nextUrl.searchParams.getAll(key);
    params[key] = values.length > 1 ? values : values[0];
  }
  const list = filterProspects(await getProspects(), parseProspectFilters(params));
  return new Response("﻿" + prospectsCsv(list), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="first-movers-prospects-${todayInToronto()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
