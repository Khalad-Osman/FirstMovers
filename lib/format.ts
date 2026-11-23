const torontoDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Unambiguous YYYY-MM-DD. Date-only strings pass through unchanged; timestamps
// are shown in Toronto time.
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : torontoDate.format(d);
}

// CLAUDE.md §10: never repeat a section's heading in its body. Strips a leading
// "What changed:" / "Countercase -" style prefix the model may add.
export function stripLabel(text: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`^\\s*${escaped}\\s*[:\\-–—]\\s*`, "i"), "");
}

// Permit records write addresses in capitals ("560 SLATE DR"). Show them in
// normal case ("560 Slate Dr") without touching names or acronyms elsewhere.
const STREET = String.raw`(?:DR|DRIVE|RD|ROAD|ST|STREET|AVE|AVENUE|BLVD|BOULEVARD|CRES|CRESCENT|CRT|CT|COURT|WAY|PKWY|PARKWAY|LINE|CIR|CIRCLE|PL|PLACE|LANE|LN|TRAIL|TR|SQ|GATE|HWY|HIGHWAY|SIDEROAD|TERR|TERRACE)`;
const CAPS_ADDRESS = new RegExp(
  String.raw`\b(\d+[A-Z]?(?:-\d+)?)\s+((?:[A-Z][A-Z'.&-]*\s+){0,4}?${STREET})\b((?:\s+(?:E|W|N|S|EAST|WEST|NORTH|SOUTH)\b)?)`,
  "g",
);
const titleWord = (w: string) => (/^(?:E|W|N|S)$/.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase());
export function normalAddressCase(text: string): string {
  return text.replace(CAPS_ADDRESS, (_m, num: string, street: string, dir: string) =>
    `${num} ${street.split(/(\s+)/).map((w) => (/\s/.test(w) ? w : titleWord(w))).join("")}${dir ? dir.replace(/[A-Z]+/, titleWord) : ""}`,
  );
}

// Split text into plain parts and source citations ("(S1, S3)", "[S2]", "S4")
// so citations can be shown as small links to the ledger.
export type TextPart = { text: string } | { ids: string[] };
const CITE = /[([]\s*(S\d+(?:\s*[,;]\s*S\d+)*)\s*[)\]]|\b(S\d+)\b/g;
export function citationParts(text: string, known: Set<string>): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(CITE)) {
    const ids = (m[1] ?? m[2]).split(/\s*[,;]\s*/).filter((id) => known.has(id));
    if (!ids.length) continue;
    const before = text.slice(last, m.index);
    if (before) parts.push({ text: before });
    parts.push({ ids });
    last = m.index! + m[0].length;
  }
  const rest = text.slice(last);
  if (rest) parts.push({ text: rest });
  return parts;
}
