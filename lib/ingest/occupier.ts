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
  /^(?:the\s)?(?:illuminated|non[- ]?illuminated|existing|new|proposed|interior|exterior|tenants?'?|landlords?'?s?|unit|suite|building|bldg|warehouse|office|signage?|sign|fascia|pylon|ground|channel letters?|letters?|logo|face change|alterations?|renovations?|revision|demo(?:lition)?|sprinklers?|racking|mezzanine|addition|change of use|storage|retail|industrial|commercial|n\/?a|tbd|various|see plans?)\b/i;

// Landlords and property companies appear on leasing signs and base-building
// work; they are not the occupier.
const LANDLORD =
  /\b(?:propert(?:y|ies)|realty|reit|developments?|leasing|for lease|real estate|asset management|investments?|capital|dream industrial|twofer|cadillac fairview|riocan|smartcentres|smart centres|first capital|primaris|crombie|morguard|ivanhoe ?cambridge|bentall|quadreal|oxford)\b/i;

// Placeholders and sentence fragments that are not business names, and a bare
// type of business ("Beauty Salon", "DENTAL") rather than its name (retail
// permits, added 2026-11-23).
const NOT_A_BUSINESS =
  /^(?:a|an)\s|^(?:future|prospective|new|potential)\s+tenants?\b|\b(?:scope of work|work is limited|designer'?s|tenant fit[- ]?(?:up|out)|ground floor|at grade|playground)\b|^(?:the\s)?(?:beauty salon|hair salon|nail salon|salon|spa|dental(?: office| clinic)?|dentist|medical(?: office| clinic)?|clinic|pharmacy|restaurant|cafe|daycare|barbershop|barber shop|gym|fitness(?: centre| center)?|retail(?: store)?|store|convenience store|office)\.?$/i;

const LEGAL_END = new RegExp(String.raw`\s${LEGAL}$`, "i");
// A phrase ending in a kind of premises, or "with accessory …", is a use description.
const GENERIC_USE =
  /\b(?:factory|warehouse|plant|restaurant|bakery|kitchen|offices?|storage|showroom|store|shop|facility|space|unit|premises|use|manufacturing|processing|production)\s*\.?$|\bwith accessory\b/i;
// Numbered Ontario/Canada companies: "16295932 CANADA INC"
const NUMBERED = new RegExp(String.raw`\b\d{6,10}\s+(?:canada|ontario)\s+${LEGAL}`, "i");

function looksLikeName(name: string): boolean {
  if (NOT_A_BUSINESS.test(name)) return false;
  if (LEGAL_END.test(name)) return true;
  // Without a legal suffix, accept only ALL-CAPS business-style text (permit
  // clerks capitalise names); mixed-case text is usually a sentence fragment.
  const letters = name.replace(/[^A-Za-z]/g, "");
  const upper = name.replace(/[^A-Z]/g, "").length;
  if (letters.length >= 3 && upper / letters.length >= 0.8) return true;
  // Or Title Case: every significant word capitalised ("Bank of Nova Scotia").
  const words = name.split(/\s+/).filter((w) => /[A-Za-z]/.test(w) && !/^(?:of|and|the|de|du|la|le|&)$/i.test(w));
  return words.length >= 1 && words.every((w) => /^[A-Z0-9]/.test(w));
}

function clean(raw: string): string | null {
  const numbered = NUMBERED.exec(raw);
  if (numbered) return numbered[0].trim();
  // Permit text puts the business after the work: keep the last segment after a
  // dash or a joining word. "INSTALL RACKING SYSTEM - 247 FULFILLMENT LTD." ->
  // "247 FULFILLMENT LTD."; "racking for ACME INC" -> "ACME INC"
  const afterDash = raw.split(/\s+[-–]\s*|\s*[-–]\s+/).pop() ?? raw;
  const tail = afterDash.split(/\s(?:for|by)\s/i).pop() ?? afterDash;
  const name = tail
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–:,"'(]+|[\s\-–:,"')]+$/g, "")
    .trim();
  if (name.length < 3 || name.length > 80) return null;
  if (NOT_A_NAME.test(name)) return null;
  if (LANDLORD.test(name)) return null;
  // "FIT-OUT … FOR CHOCOLATE FACTORY (WITH ACCESSORY RESTAURANT)" describes a use, not a business.
  if (!LEGAL_END.test(name) && GENERIC_USE.test(name)) return null;
  if (!looksLikeName(name)) return null;
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

// Caledon and Oakville wording (added 2026-11-23). The captured name can carry
// a trailing use word ("TD SYNNEX Office's"), which is trimmed for these only.
const USE_TAIL = /\s+(?:office'?s?|offices|warehouse|facility|plant|building|operations?)\.?$/i;
const TRIMMED: RegExp[] = [
  // "(Tenant Fit-Out - TD SYNNEX Office's)"
  new RegExp(String.raw`\bfit[- ]?(?:out|up)\s*[-–:]\s*(${NAME})\s*(?:$|[;()\n]|\s-\s)`, "i"),
  // "industrial building for Concast manufacturing facility"
  new RegExp(String.raw`\b(?:building|facility|warehouse|plant)\s+for\s+(${NAME})\s+(?:manufacturing|production|processing|distribution|warehousing)?\s*(?:facility|plant|operations|use)\b`, "i"),
  // "... office area for North Keg-Unit D1" / "for Sir Corp. – Unit D2"
  new RegExp(String.raw`\sfor\s+(${NAME})\s*[-–]\s*(?:unit|suite)\b`, "i"),
  // "(Work Platform to Support Conveyor) - NLS, (Building H)"
  new RegExp(String.raw`\)\s*[-–]\s*(${NAME})\s*(?:,|\(|$)`, "i"),
];

// Wording used by permit offices outside the GTA (added 2026-11-23), passed in
// by those sources only so the GTA results don't change:
//   Kitchener "Permit is for interior alterations for Sephora in unit 2."
//   Kitchener "… for a Tim Horton's restaurant in Building B, Unit 109."
//   Waterloo  "Interior alteration to existing office building for Alder Concrete Group."
//   Waterloo  "Unit A11 - Tenant fit out to create Knix."
//   Ottawa    "Tenant fit up in a 1 storey industrial building (McCabe Promotional)"
const STORE_TAIL =
  /\s+(?:retail\s+)?(?:restaurant|grocery store|store|shop|outlet|location|franchise|clinic|office|offices|studio|cafe|bakery|facility|warehouse|plant|building|branch|kiosk)s?\.?$/i;
export const OUTSIDE_GTA_PATTERNS: RegExp[] = [
  new RegExp(String.raw`\bfor\s+(?:an?\s+(?:new\s+)?|the\s+)?(${NAME})\s+(?:in|at|within|on)\s+(?:the\s+)?(?:units?|suites?|building|bldg|\d)`, "i"),
  new RegExp(String.raw`\bfor\s+(?:the\s+)?(${NAME})\.?\s*$`, "i"),
  new RegExp(String.raw`\bto\s+(?:create|accommodate|construct)\s+(?:an?\s+(?:new\s+)?)?(${NAME})\.?\s*$`, "i"),
];
// Ottawa puts the business, or a note, in brackets at the end. Notes are work
// descriptions; a business name has no work words.
const BRACKET = /\(([^()]{3,60})\)\s*\.?\s*$/;
const WORK_WORDS =
  /\b(?:replace|replacement|removal|remove|install|installation|repair|repairs|upgrade|alteration|renovation|system|panel|wall|walls|roof|garage|centre|center|structure|building|bldg|occupancy|classification|permit|phase|unit|units|floor|storey|foundation|superstructure|shell|only|full|partial|interior|exterior|washroom|mezzanine|portable|addition|demolition|generator|switchgear|pumphouse|solar|tank|elevator|sprinkler|fire|alarm|damper|ventilation|exhaust|signage|sign|canopy|patio|deck|parking|storage|warehouse|office|retail|restaurant|shop|kitchen|lab|laboratory|research|development|accessory|tenant|vacant|existing|proposed|new|cancelled|revision|amendment|model|elev|lot|block|ver)\b/i;

function fromBracket(text: string): string | null {
  const m = BRACKET.exec(text);
  if (!m) return null;
  const inner = m[1].trim();
  if (WORK_WORDS.test(inner) || /\d{2,}/.test(inner)) return null;
  return clean(inner);
}

// Outside the GTA, names pass one more check (added 2026-11-23 after a dry run
// of the five cities): a type of business ("Tattoo Parlour", "Group D", "Learning
// Center"), work ("Underpinning", "Fire Pumps"), public bodies and home builders
// are not occupiers; "Walmart, Billings Bridge" keeps the business part.
const OUTSIDE_NOT_OCCUPIER =
  /\b(?:homes|library|cemetery|church|mosque|school|academy|university|college|city of|region of|county of|hospital|ymca|ywca|unit|units|sign|signs|sale|update|group [a-f](?:-\d)?)\b|\.\.\.$|^(?:the\s)?(?:local(?: company)?|learning cent(?:re|er)|billiards\b.*|pilates|physiotherapy|physio and wellness|tattoo\b.*|car dealership|(?:hazardous )?waste|cardiology clinic|dessert bar\b.*|fire pumps?|underpinning|hydro vault|wine ?bar|food preparation|electrical buildings?|dog day ?care|bakery and cafe|dcva|cru\b.*)$|^bay$/i;

function tidyOutside(name: string): string | null {
  const parts = name.split(/\s*,\s*/).filter((p) => p && !/^units?\b/i.test(p));
  let out = (LEGAL_END.test(name) ? parts.find((p) => LEGAL_END.test(p)) : parts[0]) ?? "";
  out = out.replace(/\s+(?:expansion|drive[- ]thru(?: update)?)$/i, "").trim();
  if (out.length < 3 || OUTSIDE_NOT_OCCUPIER.test(out)) return null;
  return out;
}

export function resolveOccupier(description: string | null | undefined, opts: { outsideGta?: boolean } = {}): Occupier {
  const found = resolveRaw(description, Boolean(opts.outsideGta));
  if (!opts.outsideGta || !found.name) return found;
  const name = tidyOutside(found.name);
  const key = name ? normalizeCompanyName(name) : "";
  return name && key.length >= 3 ? { name, entityKey: key, status: "named" } : { name: null, entityKey: null, status: "unresolved" };
}

function resolveRaw(description: string | null | undefined, outsideGta: boolean): Occupier {
  const text = (description ?? "").trim();
  if (!text) return { name: null, entityKey: null, status: "unresolved" };
  if (outsideGta) {
    const named = (name: string | null): Occupier | null => {
      const key = name ? normalizeCompanyName(name) : "";
      return name && key.length >= 3 ? { name, entityKey: key, status: "named" } : null;
    };
    const b = named(fromBracket(text));
    if (b) return b;
    for (const re of OUTSIDE_GTA_PATTERNS) {
      const m = re.exec(text);
      if (!m) continue;
      // Keep "Gwalia Sweets and Restaurants" whole: trim a use word only when it
      // doesn't leave a dangling "and"/"&".
      const trimmed = m[1].replace(STORE_TAIL, "");
      const hit = named(clean(/(?:\sand|&)$/i.test(trimmed) ? m[1] : trimmed));
      if (hit) return hit;
    }
  }
  for (const [i, re] of TRIMMED.entries()) {
    const m = re.exec(text);
    let name = m ? clean(m[1].replace(USE_TAIL, "")) : null;
    // After ") - " Caledon clerks also write notes in Title Case ("Alternative
    // Solution", "Classification of Building Has Been Revised…"): accept only
    // ALL-CAPS names or names with a legal suffix there.
    if (name && i === TRIMMED.length - 1 && !LEGAL_END.test(name) && name !== name.toUpperCase()) name = null;
    if (name) {
      const key = normalizeCompanyName(name);
      if (key.length >= 3) return { name, entityKey: key, status: "named" };
    }
  }
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
