// Email sending, behind a provider-agnostic interface (like lib/llm/).
// Added 2026-11-25 before the team has a sending address: with no provider
// configured, getEmailSender() returns null and callers record the email in
// the outbox as 'not_configured' instead of sending it.
//
// To turn sending on, set (server-only):
//   EMAIL_PROVIDER=resend
//   EMAIL_FROM="First Movers <alerts@your-domain>"   (a verified sender)
//   RESEND_API_KEY=...
//   APP_URL=https://first-movers-ten.vercel.app       (links in emails)
// Another provider = one adapter below + one case in getEmailSender().

export type EmailMessage = { to: string; subject: string; text: string; html: string };
export type SendResult = { ok: true; id: string | null } | { ok: false; error: string };

export interface EmailSender {
  readonly provider: string;
  readonly from: string;
  send(message: EmailMessage): Promise<SendResult>;
}

type Env = Record<string, string | undefined>;

export type EmailStatus = { configured: true; provider: string; from: string } | { configured: false; missing: string[] };

// What is missing, without revealing any value.
export function emailStatus(env: Env = process.env): EmailStatus {
  const provider = env.EMAIL_PROVIDER?.trim().toLowerCase();
  const from = env.EMAIL_FROM?.trim();
  const missing: string[] = [];
  if (!provider) missing.push("EMAIL_PROVIDER");
  if (!from) missing.push("EMAIL_FROM");
  if (provider === "resend" && !env.RESEND_API_KEY?.trim()) missing.push("RESEND_API_KEY");
  if (provider && provider !== "resend") missing.push(`a supported EMAIL_PROVIDER (got "${provider}")`);
  return missing.length ? { configured: false, missing } : { configured: true, provider: provider!, from: from! };
}

export function getEmailSender(env: Env = process.env, fetchImpl: typeof fetch = fetch): EmailSender | null {
  const status = emailStatus(env);
  if (!status.configured) return null;
  switch (status.provider) {
    case "resend":
      return resendSender(status.from, env.RESEND_API_KEY!.trim(), fetchImpl);
    default:
      return null;
  }
}

// Resend's REST API with plain fetch (no SDK dependency).
function resendSender(from: string, apiKey: string, fetchImpl: typeof fetch): EmailSender {
  return {
    provider: "resend",
    from,
    async send(m) {
      try {
        const res = await fetchImpl("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
        });
        const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}${body.message ? `: ${body.message}` : ""}` };
        return { ok: true, id: body.id ?? null };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}

// Base URL for links in emails.
export function appUrl(env: Env = process.env): string {
  const raw = env.APP_URL?.trim() || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
  return raw.replace(/\/+$/, "");
}
