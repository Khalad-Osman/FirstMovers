import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runDaily } from "@/lib/schedule/daily";

// Daily scheduled job (Vercel Cron, see vercel.json). Vercel sends
// "Authorization: Bearer $CRON_SECRET". Outside the sign-in check (proxy.ts).
export const maxDuration = 300;

function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16 || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!authorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const summary = await runDaily(request.nextUrl.origin);
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
