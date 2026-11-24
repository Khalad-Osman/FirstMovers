import "server-only";
import { checkBriefIntegrity } from "@/lib/brief/integrity";
import { modelOutputSchema, type BriefAnalysis } from "@/lib/brief/schema";
import { toStrictJsonSchema, type ChatMessage, type LLMProvider } from "@/lib/llm";
import { buildBrief } from "./build";
import { buildSystemPrompt, buildUserMessage } from "./prompt";
import { analysisInputSchema, type AnalysisInput } from "./types";

export type AnalysisUsage = { llmCalls: number; inputTokens: number; outputTokens: number };

export type AnalysisResult =
  | { ok: true; brief: BriefAnalysis; model: string; attempts: number; usage: AnalysisUsage }
  | { ok: false; errors: string[]; model: string; attempts: number; usage: AnalysisUsage; lastOutput: string | null };

const MAX_ATTEMPTS = 2; // CLAUDE.md §7: on validation failure, retry once, then record an error.
const JSON_SCHEMA = toStrictJsonSchema(modelOutputSchema);

type Options = { provider: LLMProvider; model: string; systemPrompt?: string; sector?: "industrial" | "retail" };

// Turn collected sources into a validated brief. Never returns unvalidated
// output: a brief is returned only if it passes the schema, the source join and
// every rule check in lib/brief/integrity.ts.
export async function analyzeCompany(rawInput: AnalysisInput, { provider, model, systemPrompt, sector }: Options): Promise<AnalysisResult> {
  const usage: AnalysisUsage = { llmCalls: 0, inputTokens: 0, outputTokens: 0 };
  const parsedInput = analysisInputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    return {
      ok: false,
      errors: parsedInput.error.issues.map((i) => `Input ${i.path.join(".")}: ${i.message}`),
      model,
      attempts: 0,
      usage,
      lastOutput: null,
    };
  }
  const input = parsedInput.data;
  const system = systemPrompt ?? buildSystemPrompt(undefined, sector);
  const messages: ChatMessage[] = [{ role: "user", content: buildUserMessage(input) }];

  let errors: string[] = [];
  let lastOutput: string | null = null;
  let usedModel = model;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let text: string;
    try {
      const res = await provider.generateStructured({
        model,
        system,
        messages,
        schemaName: "commercial_intelligence_brief",
        jsonSchema: JSON_SCHEMA,
      });
      usage.llmCalls += 1;
      usage.inputTokens += res.usage.inputTokens;
      usage.outputTokens += res.usage.outputTokens;
      usedModel = res.model;
      text = res.text;
    } catch (e) {
      // Provider errors (auth, refusal, network after retries) are not retried here.
      return {
        ok: false,
        errors: [e instanceof Error ? e.message : String(e)],
        model: usedModel,
        attempts: attempt,
        usage,
        lastOutput,
      };
    }
    lastOutput = text;
    errors = validate(text, input.sources, input.analysisDate);
    if (errors.length === 0) {
      const built = buildBrief(modelOutputSchema.parse(JSON.parse(text)), input.sources, input.analysisDate);
      if (built.ok) return { ok: true, brief: built.brief, model: usedModel, attempts: attempt, usage };
    }

    messages.push(
      { role: "assistant", content: text },
      {
        role: "user",
        content: `Your brief failed these checks:\n${errors.map((e) => `- ${e}`).join("\n")}\n\nReturn a corrected JSON brief that fixes every item. Change the rating if the evidence does not support it.`,
      },
    );
  }

  return { ok: false, errors, model: usedModel, attempts: MAX_ATTEMPTS, usage, lastOutput };
}

function validate(text: string, sources: Parameters<typeof buildBrief>[1], analysisDate: string): string[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return ["Output is not valid JSON."];
  }
  const parsed = modelOutputSchema.safeParse(json);
  if (!parsed.success) {
    return parsed.error.issues.slice(0, 20).map((i) => `Schema: ${i.path.join(".") || "(root)"}: ${i.message}`);
  }
  const built = buildBrief(parsed.data, sources, analysisDate);
  if (!built.ok) return built.errors;
  return checkBriefIntegrity(built.brief);
}
