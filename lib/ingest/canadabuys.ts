import { normalizeCompanyName } from "@/lib/research/normalize";
import { parseDelimited, textChunks } from "./csv";
import { money, type IngestContext, type IngestItem, type IngestSource } from "./types";

// CanadaBuys award notices (checked 2026-11-10). One CSV per fiscal year
// (April 1 – March 31); the current year refreshes daily. Every amendment is a
// separate row with its own reference number; rows of one contract share the
// contract number, and the highest amendment number is the current state.
// Notice page: https://canadabuys.canada.ca/en/tender-opportunities/award-notice/{referenceNumber}

const BASE = "https://canadabuys.canada.ca/opendata/pub";
const COL = {
  title: "title-titre-eng",
  reference: "referenceNumber-numeroReference",
  amendment: "amendmentNumber-numeroModification",
  contract: "contractNumber-numeroContrat",
  published: "publicationDate-datePublication",
  awarded: "contractAwardDate-dateAttributionContrat",
  amount: "contractAmount-montantContrat",
  total: "totalContractValue-valeurTotaleContrat",
  currency: "contractCurrency-contratMonnaie",
  status: "awardStatus-attributionStatut-eng",
  category: "procurementCategory-categorieApprovisionnement",
  gsin: "gsinDescription-nibsDescription-eng",
  supplier: "supplierLegalName-nomLegalFournisseur-eng",
  city: "supplierAddressCity-fournisseurAdresseVille-eng",
  province: "supplierAddressProvince-fournisseurAdresseProvince-eng",
  postal: "supplierAddressPostalCode-fournisseurAdresseCodePostal",
  buyer: "contractingEntityName-nomEntitContractante-eng",
  regions: "regionsOfDelivery-regionsLivraison-eng",
} as const;

const GOODS_CATEGORIES = new Set(["GD", "CNST", "SRVTGD"]); // pure services (SRV) excluded

export function fiscalYearFiles(cutoff: string, today: string): string[] {
  const fyStart = (d: string) => {
    const [y, m] = d.split("-").map(Number);
    return m >= 4 ? y : y - 1;
  };
  const files: string[] = [];
  for (let y = fyStart(cutoff); y <= fyStart(today); y++) files.push(`${BASE}/${y}-${y + 1}-awardNotice-avisAttribution.csv`);
  return files;
}

const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const list = (s: string | undefined) =>
  (s ?? "")
    .split(/\n/)
    .map((x) => x.replace(/^\*/, "").trim())
    .filter(Boolean);

export function contractValue(r: Record<string, string>): number {
  return Math.max(Number(r[COL.amount]) || 0, Number(r[COL.total]) || 0);
}

// Pure filter + mapper for one (latest-amendment) row; exported for tests.
export function mapAward(r: Record<string, string>, ctx: Pick<IngestContext, "cutoff" | "canadabuysMinValue">): IngestItem {
  const province = clean(r[COL.province]);
  if (!/^(ontario|on)$/i.test(province)) return { skip: "supplier not in Ontario" };
  if (!/^active$/i.test(clean(r[COL.status]))) return { skip: "award not active" };
  const categories = list(r[COL.category]);
  if (!categories.some((c) => GOODS_CATEGORIES.has(c))) return { skip: "services only" };
  const awarded = clean(r[COL.awarded]) || clean(r[COL.published]);
  if (!awarded || awarded < ctx.cutoff) return { skip: "older than 12 months" };
  const value = contractValue(r);
  if (value < ctx.canadabuysMinValue) return { skip: "below minimum contract value" };
  const supplier = clean(r[COL.supplier]);
  if (!supplier) return { skip: "no supplier name" };

  const reference = clean(r[COL.reference]);
  const currency = clean(r[COL.currency]) || "CAD";
  const city = clean(r[COL.city]);
  const buyer = clean(r[COL.buyer]);
  const goods = list(r[COL.gsin]).join("; ");
  const regions = list(r[COL.regions]).join(", ");
  return {
    row: {
      source_type: "canadabuys_award",
      source_record_id: clean(r[COL.contract]) || reference,
      raw_entity_name: supplier,
      entity_key: normalizeCompanyName(supplier) || null,
      occupier_status: "not_applicable",
      signal_strength: "award",
      title: `Federal contract award: ${clean(r[COL.title]) || goods || "untitled"} (${supplier})`,
      summary: [
        `${money(value)} ${currency}`,
        goods && `Goods: ${goods}`,
        buyer && `Buyer: ${buyer}`,
        regions && `Delivery: ${regions}`,
        `Categories: ${categories.join(", ")}`,
      ]
        .filter(Boolean)
        .join(". "),
      url: reference ? `https://canadabuys.canada.ca/en/tender-opportunities/award-notice/${encodeURIComponent(reference)}` : null,
      published_at: clean(r[COL.published]) || null,
      event_at: clean(r[COL.awarded]) || null,
      location: [city, "Ontario", clean(r[COL.postal])].filter(Boolean).join(", "),
      raw: r,
    },
  };
}

async function* run(ctx: IngestContext): AsyncGenerator<IngestItem> {
  // Keep only the latest amendment per contract, across all files read.
  const latest = new Map<string, Record<string, string>>();
  let read = 0;
  for (const url of fiscalYearFiles(ctx.cutoff, ctx.today)) {
    await ctx.progress(`Downloading ${url.split("/").pop()}`);
    const res = await ctx.fetchImpl(url, { signal: AbortSignal.timeout(240_000) });
    if (!res.ok || !res.body) throw new Error(`CanadaBuys download failed (${res.status}) for ${url}`);
    for await (const r of parseDelimited(textChunks(res.body))) {
      read++;
      // Cheap pre-filter before buffering: Ontario suppliers only.
      if (!/^(ontario|on)$/i.test(clean(r[COL.province]))) {
        yield { skip: "supplier not in Ontario" };
        continue;
      }
      const key = clean(r[COL.contract]) || clean(r[COL.reference]);
      const prev = latest.get(key);
      if (!prev || Number(r[COL.amendment]) >= Number(prev[COL.amendment])) {
        if (prev) yield { skip: "superseded amendment" };
        latest.set(key, r);
      } else yield { skip: "superseded amendment" };
    }
    await ctx.progress(`Read ${read.toLocaleString("en-CA")} award rows`);
  }
  for (const r of latest.values()) yield mapAward(r, ctx);
}

export const canadabuys: IngestSource = {
  source: "canadabuys_award",
  label: "CanadaBuys award notices",
  description: "Federal contract awards to Ontario suppliers: goods and construction, last 12 months, active, at or above the minimum value.",
  run,
};
