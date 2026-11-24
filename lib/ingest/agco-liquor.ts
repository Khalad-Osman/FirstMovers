import { normalizeCompanyName } from "@/lib/research/normalize";
import type { IngestContext, IngestItem, IngestSource, SignalRow } from "./types";

// AGCO liquor sales licence applications in public notice (added 2026-11-24,
// retail). The AGCO publishes a CSV of every application currently in public
// notice, refreshed daily (checked 2026-11-24: ~70 rows, about half in the GTA):
// city, premises_name, address, deadline_objections_submissions ("04-DEC-26"),
// file_number, application_type_en ("New Application", "Change Application -
// Changes and/or Additions to Existing Licensed Areas", "… Other Change(s)"),
// licence_type_en, areas.
//
// The file is a snapshot with no filing date, so a record is dated by the day
// this app first saw it (raw.date_basis); the objection deadline is kept.
// "(TBKA: NEW NAME)" (to be known as) marks a rebrand or new operator.
export const LIQUOR_CSV = "https://www.agco.ca/sites/default/files/opendata/LiquorApplicationsUndergoingPublicNotice.csv";
const STATUS_PAGE = "https://www.agco.ca/en/alcohol/status-current-liquor-sales-licence-applications";

const MONTHS: Record<string, string> = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };

// "04-DEC-26" -> "2026-12-04"
export function liquorDate(v: string): string | null {
  const m = /^(\d{1,2})-([A-Z]{3})-(\d{2})$/i.exec(v.trim());
  const mm = m && MONTHS[m[2].toUpperCase()];
  return m && mm ? `20${m[3]}-${mm}-${m[1].padStart(2, "0")}` : null;
}

// Quoted CSV; fields may contain commas (addresses).
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

// "(TBKA: NEW NAME)", "(T.B.K.A NEW NAME)" or "OLD NAME T.B.K.A NEW NAME"
const TBKA = /\(\s*t\.?\s*b\.?\s*k\.?\s*a\.?\s*:?\s*([^)]+)\)|\s+t\.b\.k\.a\.?:?\s+(.+)$/i;

export type LiquorKind = "liquor_new" | "liquor_rebrand" | "liquor_expansion" | "liquor_change";

export function mapLiquor(r: Record<string, string>, ctx: Pick<IngestContext, "today"> & { stored: Map<string, string | null> }): IngestItem {
  const file = r.file_number?.trim();
  const premises = (r.premises_name ?? "").replace(/\s+/g, " ").trim();
  const address = (r.address ?? "").replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
  if (!file || !premises) return { skip: "no file number or premises name" };
  const type = (r.application_type_en ?? "").trim();
  const tbka = TBKA.exec(premises);
  const current = premises.replace(TBKA, "").trim();
  const name = (tbka ? (tbka[1] ?? tbka[2]) : current).trim();
  const key = normalizeCompanyName(name);
  if (key.length < 3) return { skip: "no business name" };
  const kind: LiquorKind = /additions? to existing licensed areas/i.test(type)
    ? "liquor_expansion"
    : /other change/i.test(type)
      ? "liquor_change"
      : tbka
        ? "liquor_rebrand"
        : "liquor_new";
  const id = `liquor:${file}`;
  const stored = ctx.stored.get(id);
  const date = stored ?? ctx.today;
  const deadline = liquorDate(r.deadline_objections_submissions ?? "");
  const what = {
    liquor_new: "New liquor sales licence application",
    liquor_rebrand: `Liquor licence application by a new operator or name (${current} to be known as ${name})`,
    liquor_expansion: "Application to add or change licensed areas",
    liquor_change: "Liquor licence change application",
  }[kind];
  const row: SignalRow = {
    source_type: "agco_liquor",
    source_record_id: id,
    raw_entity_name: name,
    entity_key: key,
    occupier_status: "named",
    signal_strength: "store_licence",
    title: `AGCO: ${what}: ${name}, ${address}`,
    summary: [
      `${what}.`,
      `Premises: ${premises}. Address: ${address}.`,
      r.licence_type_en && `Licence: ${r.licence_type_en.trim()}.`,
      r.areas && `Areas: ${r.areas.trim()}.`,
      deadline && `Objections close ${deadline}.`,
      `Date: ${date} (first seen in the AGCO public notice list; the list gives no filing date).`,
    ]
      .filter(Boolean)
      .join(" "),
    url: STATUS_PAGE,
    published_at: date,
    event_at: null,
    location: address.replace(/, ON,/, ", Ontario,").replace(/, ON$/, ", Ontario") || null,
    raw: { ...r, kind, date_basis: "first seen in the AGCO public notice list", deadline },
    sector: "retail",
  };
  return { row };
}

async function* runLiquor(ctx: IngestContext): AsyncGenerator<IngestItem> {
  await ctx.progress("Reading AGCO liquor licence applications");
  const res = await ctx.fetchImpl(LIQUOR_CSV, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`AGCO liquor CSV failed (${res.status})`);
  const lines = (await res.text()).replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    yield mapLiquor(Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""])), { today: ctx.today, stored: ctx.stored ?? new Map() });
  }
}

export const agcoLiquor: IngestSource = {
  source: "agco_liquor",
  label: "AGCO liquor licence applications",
  description: "Liquor sales licence applications in public notice (new restaurants and venues, new operators, added licensed areas), from the AGCO's daily list. Retail.",
  snapshot: true,
  run: runLiquor,
};
