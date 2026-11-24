// Industrial and retail (retail added 2026-11-23). Every signal, research
// session, discovery run and brief belongs to one sector; industrial is the
// default so existing data and links keep their meaning.
export const SECTORS = ["industrial", "retail"] as const;
export type Sector = (typeof SECTORS)[number];

export const SECTOR_LABEL: Record<Sector, string> = { industrial: "Industrial", retail: "Retail" };

export function parseSector(value: unknown): Sector {
  return value === "retail" ? "retail" : "industrial";
}

// A filter value that may also be "all" (feed, prospects).
export function parseSectorFilter(value: unknown): Sector | "all" {
  return value === "retail" || value === "industrial" ? value : "all";
}

// Retail occupiers recognised from a name or description (no AI): stores,
// restaurants and food service, grocery, franchises, cannabis stores, car
// dealerships, gyms and personal services, and medical/dental clinics.
export const RETAIL_USE =
  /\b(?:retail|store|shop|boutique|restaurant|eatery|cafe|café|coffee|bakery|pizza|burger|grill|bistro|bar\b|pub\b|kitchen|food court|take[- ]?out|quick service|qsr|grocery|supermarket|market\b|convenience|pharmacy|drug ?mart|cannabis|dispensary|dealership|car dealer|auto sales|motors\b|gym|fitness|yoga|pilates|salon|spa\b|barber|nail|beauty|esthetic|clinic|dental|dentist|medical|physio|optometr|veterinar|pet ?(?:store|shop|supplies)|daycare|child ?care|tutoring|learning cent(?:re|er)|franchise)\b/i;
