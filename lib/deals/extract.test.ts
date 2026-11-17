import { describe, expect, it } from "vitest";
import { createFakeProvider } from "@/lib/llm/fake";
import { extractDealsFromPdf, MAX_PDF_BYTES } from "./extract";

const pdf = { filename: "deals.pdf", bytes: new Uint8Array([37, 80, 68, 70]) };
const row = (over: object = {}) => ({ occupier: "Acme Foods Inc.", companyType: "food_beverage", region: null, municipality: "Brampton", dealType: "lease", sizeSqft: 120000.4, clearHeightFt: 32, dealDate: "2024", notes: null, ...over });

describe("extractDealsFromPdf", () => {
  it("sends the PDF once and returns cleaned drafts for review", async () => {
    const { provider, requests } = createFakeProvider([{ deals: [row(), row({ occupier: "  " })] }]);
    const r = await extractDealsFromPdf(pdf, { provider, model: "m" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.drafts).toEqual([{ occupier: "Acme Foods Inc.", companyType: "food_beverage", region: "peel", municipality: "Brampton", dealType: "lease", sizeSqft: 120000, clearHeightFt: 32, dealDate: "2024-01-01", notes: null }]);
    expect(r.dropped).toBe(1); // blank occupier
    expect(requests).toHaveLength(1);
    expect(requests[0].attachments?.[0]).toMatchObject({ filename: "deals.pdf", mediaType: "application/pdf", dataBase64: "JVBERg==" });
    expect(requests[0].system).toMatch(/untrusted content/);
  });

  it("retries once on invalid output, then gives up with a clear message", async () => {
    const { provider, requests } = createFakeProvider(["not json", { deals: "nope" }]);
    const r = await extractDealsFromPdf(pdf, { provider, model: "m" });
    expect(requests).toHaveLength(2);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/couldn't|could not be read reliably/) });
  });

  it("refuses files over the size limit without calling the model", async () => {
    const { provider, requests } = createFakeProvider([]);
    const r = await extractDealsFromPdf({ filename: "big.pdf", bytes: new Uint8Array(MAX_PDF_BYTES + 1) }, { provider, model: "m" });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/larger than 3 MB/) });
    expect(requests).toHaveLength(0);
  });
});
