// Search queries for company research. Kept small: each search costs credits.

export function companyQueries(name: string): string[] {
  const q = `"${name.replace(/"/g, "")}"`;
  return [
    `${q} Ontario plant OR warehouse OR facility OR distribution`,
    `${q} expansion OR contract OR investment OR hiring`,
    `${q} news release`,
  ];
}

// Follow-up for a 12–24 month old announcement: look for recent evidence that
// the program moved forward (site selection, hiring, equipment, construction, production).
export function followUpQuery(name: string, announcementTitle: string): string {
  const topic = announcementTitle
    .replace(/["|–—-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 6)
    .join(" ");
  return `"${name.replace(/"/g, "")}" ${topic} site OR hiring OR construction OR production OR opening`;
}

// Google-style tbs date window: results from the last `months` months.
export function sinceMonthsTbs(months: number, today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `cdr:1,cd_min:${mm}/${dd}/${d.getUTCFullYear()}`;
}
