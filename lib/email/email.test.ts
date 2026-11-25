import { describe, expect, it, vi } from "vitest";
import { appUrl, emailStatus, getEmailSender } from "./sender";
import { discoveryRunEmail, escapeHtml, newBriefEmail, stripCitations, weeklyDigestEmail, type BriefDigestItem } from "./templates";

const BASE = "https://app.example";
const item = (over: Partial<BriefDigestItem> = {}): BriefDigestItem => ({
  id: "b1",
  companyName: "Larchmere & Finch Bakehouse Inc.",
  sector: "retail",
  rating: "worth_monitoring",
  angleType: "new_requirement",
  headline: "A second bakery location is planned (S1, S3).",
  summary: "Site search for a 2,000 sq ft unit (S2).",
  analyzedAt: "2026-11-24",
  ...over,
});

describe("emailStatus / getEmailSender", () => {
  it("is not configured with no variables, and names what is missing", () => {
    const s = emailStatus({});
    expect(s.configured).toBe(false);
    if (!s.configured) expect(s.missing).toEqual(["EMAIL_PROVIDER", "EMAIL_FROM"]);
    expect(getEmailSender({})).toBeNull();
  });

  it("needs the Resend key and rejects unknown providers", () => {
    const s = emailStatus({ EMAIL_PROVIDER: "resend", EMAIL_FROM: "a@b.c" });
    expect(s.configured).toBe(false);
    if (!s.configured) expect(s.missing).toEqual(["RESEND_API_KEY"]);
    expect(emailStatus({ EMAIL_PROVIDER: "carrier-pigeon", EMAIL_FROM: "a@b.c" }).configured).toBe(false);
  });

  it("sends through Resend with the key in the header and reports errors", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "msg_1" }), { status: 200 }));
    const sender = getEmailSender({ EMAIL_PROVIDER: "resend", EMAIL_FROM: "First Movers <a@b.c>", RESEND_API_KEY: "k" }, fetchImpl as unknown as typeof fetch)!;
    expect(sender.provider).toBe("resend");
    expect(await sender.send({ to: "x@y.z", subject: "s", text: "t", html: "<p>h</p>" })).toEqual({ ok: true, id: "msg_1" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k");
    expect(JSON.parse(init.body as string)).toMatchObject({ from: "First Movers <a@b.c>", to: ["x@y.z"], subject: "s" });

    const failing = getEmailSender(
      { EMAIL_PROVIDER: "resend", EMAIL_FROM: "a@b.c", RESEND_API_KEY: "k" },
      (async () => new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 })) as unknown as typeof fetch,
    )!;
    expect(await failing.send({ to: "x@y.z", subject: "s", text: "t", html: "h" })).toEqual({ ok: false, error: "HTTP 403: domain not verified" });
  });

  it("builds the base URL without a trailing slash", () => {
    expect(appUrl({ APP_URL: "https://a.example/" })).toBe("https://a.example");
    expect(appUrl({ VERCEL_PROJECT_PRODUCTION_URL: "fm.vercel.app" })).toBe("https://fm.vercel.app");
    expect(appUrl({})).toBe("http://localhost:3000");
  });
});

describe("templates", () => {
  it("removes inline source ids and escapes HTML", () => {
    expect(stripCitations("Planned (S1, S3). Next (S2)")).toBe("Planned. Next");
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });

  it("writes a brief email with a link and no citations", () => {
    const e = newBriefEmail("strong_signal", item({ rating: "strong_signal" }), BASE);
    expect(e.subject).toBe("Strong Signal: Larchmere & Finch Bakehouse Inc.");
    expect(e.text).toContain(`${BASE}/briefs/b1`);
    expect(e.text).not.toContain("(S1");
    expect(e.html).toContain("Larchmere &amp; Finch");
  });

  it("sends no digest when there are no briefs, and lists the strongest first", () => {
    expect(weeklyDigestEmail([], "2026-11-30", BASE)).toBeNull();
    const d = weeklyDigestEmail([item({ id: "w" }), item({ id: "s", companyName: "Strong Co", rating: "strong_signal" })], "2026-11-30", BASE)!;
    expect(d.subject).toBe("First Movers weekly: 2 new briefs (week of 2026-11-30)");
    expect(d.text.indexOf("Strong Co")).toBeLessThan(d.text.indexOf("Larchmere"));
  });

  it("links a discovery email to its run", () => {
    const e = discoveryRunEmail({ title: "Discovery finished: 2 briefs", body: "2 Worth Monitoring", link: "/discovery/r1" }, BASE);
    expect(e.subject).toBe("Discovery finished: 2 briefs");
    expect(e.text).toContain(`${BASE}/discovery/r1`);
  });
});
