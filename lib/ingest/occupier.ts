import { normalizeCompanyName } from "@/lib/research/normalize";

// Shared occupier resolution for building permits (CLAUDE.md §5: permits often
// name the owner or contractor, not the occupier). No AI. We only accept a name
// when the permit text itself presents it as the business at the address.
// Builder / contractor fields are never used as the occupier.

export type Occupier = { name: string | null; entityKey: string | null; status: "named" | "unresolved" };

const LEGAL = String.raw`(?:inc|incorporated|ltd|limited|ltée|ltee|corp|corporation|co|company|llc|lp|ulc)\.?`;
const NAME = String.raw`[A-Z0-9][A-Za-z0-9&'.,\- ]{1,80}?`;

// Words that show a phrase is work, not a business ("FASCIA SIGN - ILLUMINATED").
const NOT_A_NAME =
  /^(?:the\s)?(?:illuminated|non[- ]?illuminated|existing|new|proposed|interior|exterior|tenant|landlord|unit|suite|building|bldg|warehouse|office|signage?|sign|fascia|pylon|ground|channel letters?|letters?|logo|face change|alterations?|renovations?|revision|demo(?:lition)?|sprinklers?|racking|mezzanine|addition|change of use|storage|retail|industrial|commercial|n\/?a|tbd|various|see plans?)\b/i;

function clean(raw: string): string | null {
  // Keep only what follows a joining word: "install racking for ACME INC" -> "ACME INC"
  const tail = raw.split(/\s(?:for|by)\s/i).pop() ?? raw;
  const name = tail
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–:,"'(]+|[\s\-–:,"')]+$/g, "")
    .trim();
  if (name.length < 3 || name.length > 80) return null;
  if (NOT_A_NAME.test(name)) return null;
  if (!/[A-Za-z]{2}/.test(name)) return null;
  if (/^\d/.test(name) && !/[A-Za-z]{3}/.test(name)) return null;
  return name;
}

const PATTERNS: RegExp[] = [
  // "... for ACME FABRICATION LTD" / "tenant: Acme Inc."
  new RegExp(String.raw`\b(?:tenant|occupant|occupier|business name|operator)\s*[:\-]\s*(${NAME})(?:$|[;(\n]|\s-\s)`, "i"),
  // Sign permits: "ONE (1) FASCIA SIGN - GREAT SELL" / "PYLON SIGN FOR ROYAL DRUGS"
  new RegExp(String.raw`\bsigns?\b[^\n]{0,40}?(?:\s-\s|\sfor\s|:\s)(${NAME})\s*(?:$|[;(\n]|\s-\s)`, "i"),
  // "interior alterations for ACME" / "fit-out for ACME"
  new RegExp(String.raw`\b(?:alterations?|fit[- ]?out|renovations?|addition|racking|mezzanine|change of use)\b[^\n]{0,30}?\sfor\s(${NAME})\s*(?:$|[;(\n]|\s-\s)`, "i"),
  // Explicit legal-suffix names anywhere: "ACME FABRICATION LTD"
  new RegExp(String.raw`\b(${NAME}\s${LEGAL})(?=$|[\s;,()\n])`, "i"),
];

export function resolveOccupier(description: string | null | undefined): Occupier {
  const text = (description ?? "").trim();
  if (!text) return { name: null, entityKey: null, status: "unresolved" };
  for (const re of PATTERNS) {
    const m = re.exec(text);
    const name = m ? clean(m[1]) : null;
    if (name) {
      const key = normalizeCompanyName(name);
      if (key.length >= 3) return { name, entityKey: key, status: "named" };
    }
  }
  return { name: null, entityKey: null, status: "unresolved" };
}
