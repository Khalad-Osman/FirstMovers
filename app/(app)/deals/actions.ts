"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getProvider, resolveModel } from "@/lib/llm";
import { extractDealsFromPdf } from "@/lib/deals/extract";
import { MAX_DEALS_PER_UPLOAD, pastDealSchema, type PastDealDraft } from "@/lib/deals/normalize";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Past deals are admin-only (RLS enforces it too). Every action checks the role.

export type ExtractResult = { drafts: PastDealDraft[]; dropped: number } | { error: string };

// Reads deals from one PDF with the analysis model. Nothing is saved here: the
// admin reviews the fields first.
export async function extractPdfDeals(formData: FormData): Promise<ExtractResult> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a PDF file." };
  if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) return { error: "Only PDF files are read with AI. Upload spreadsheets as CSV." };

  let provider, model;
  try {
    const { data: settings } = await createAdminClient().from("settings").select("analysis_model").maybeSingle();
    model = resolveModel("analysis", settings);
    provider = getProvider();
  } catch (e) {
    return { error: `PDF reading isn't configured yet: ${e instanceof Error ? e.message : String(e)}` };
  }
  const r = await extractDealsFromPdf({ filename: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }, { provider, model });
  if (!r.ok) return { error: r.error };
  if (r.drafts.length === 0) return { error: "No deals with an occupier were found in this PDF." };
  return { drafts: r.drafts, dropped: r.dropped };
}

const saveSchema = z.object({
  drafts: z.array(pastDealSchema).min(1, "Nothing to save.").max(MAX_DEALS_PER_UPLOAD, `At most ${MAX_DEALS_PER_UPLOAD} deals per upload.`),
  source: z.enum(["csv", "pdf"]),
  filename: z.string().trim().max(255).nullable(),
});

export async function savePastDeals(input: unknown): Promise<{ saved: number } | { error: string }> {
  const admin = await requireAdmin();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { error: `Row ${typeof i.path[1] === "number" ? i.path[1] + 1 : "?"}: ${i.message}` };
  }
  const { drafts, source, filename } = parsed.data;
  const supabase = await createClient(); // user session: RLS allows admins only
  const { error } = await supabase.from("past_deals").insert(
    drafts.map((d) => ({
      occupier: d.occupier,
      company_type: d.companyType,
      region: d.region,
      municipality: d.municipality,
      deal_type: d.dealType,
      size_sqft: d.sizeSqft,
      clear_height_ft: d.clearHeightFt,
      deal_date: d.dealDate,
      notes: d.notes,
      source,
      source_file: filename,
      created_by: admin.id,
    })),
  );
  if (error) return { error: `Could not save deals: ${error.message}` };
  revalidatePath("/", "layout");
  return { saved: drafts.length };
}

export async function deletePastDeal(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("past_deals").delete().eq("id", z.uuid().parse(id));
  if (error) return { error: `Could not delete the deal: ${error.message}` };
  revalidatePath("/", "layout");
}
