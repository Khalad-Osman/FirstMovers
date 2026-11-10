// Normalized key for matching company names. The full display name (with Inc.,
// Ltd. and so on) is always kept separately; this key only finds duplicates.
const SUFFIXES = new Set([
  "inc", "incorporated", "ltd", "ltee", "limited", "corp", "corporation", "co", "company",
  "llc", "lp", "llp", "plc", "ulc", "gmbh", "sa", "ag",
]);

export function normalizeCompanyName(name: string): string {
  const words = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (words.length > 1 && SUFFIXES.has(words[words.length - 1])) words.pop();
  return words.join(" ");
}
