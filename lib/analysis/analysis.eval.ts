// Live evaluation: runs every fixture through the real model and checks rule-following.
// SPENDS LLM CREDITS. Run only on purpose: npm run eval:analysis
// Models: EVAL_MODELS (comma-separated) or LLM_ANALYSIS_MODEL. Key: OPENAI_API_KEY.
import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getProvider } from "@/lib/llm";
import { analyzeCompany, type AnalysisResult } from "./analyze";
import { buildSystemPrompt } from "./prompt";
import { FIXTURES } from "./fixtures";

const models = (process.env.EVAL_MODELS || process.env.LLM_ANALYSIS_MODEL || "")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const only = process.env.EVAL_FIXTURES?.split(",").map((s) => s.trim());
const fixtures = only ? FIXTURES.filter((f) => only.includes(f.name)) : FIXTURES;
const ready = Boolean(process.env.OPENAI_API_KEY) && models.length > 0;

type Row = {
  model: string;
  fixture: string;
  pass: boolean;
  rating: string | null;
  expected: string;
  attempts: number;
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  problems: string[];
};

describe.skipIf(!ready)("live analysis evaluation", () => {
  const rows: Row[] = [];
  const results: { model: string; fixture: string; result: AnalysisResult }[] = [];
  const system = { industrial: buildSystemPrompt(), retail: buildSystemPrompt(undefined, "retail") };

  for (const model of models) {
    for (const f of fixtures) {
      it(`${model} · ${f.name}`, async () => {
        const result = await analyzeCompany(f.input, { provider: getProvider(), model, systemPrompt: system[f.sector ?? "industrial"] });
        results.push({ model, fixture: f.name, result });
        const problems: string[] = [];
        if (!result.ok) problems.push(...result.errors.map((e) => `invalid: ${e}`));
        else {
          if (!f.expectedRatings.includes(result.brief.rating))
            problems.push(`rating ${result.brief.rating}, expected ${f.expectedRatings.join(" or ")}`);
          problems.push(...f.check(result.brief));
        }
        rows.push({
          model,
          fixture: f.name,
          pass: problems.length === 0,
          rating: result.ok ? result.brief.rating : null,
          expected: f.expectedRatings.join("|"),
          attempts: result.attempts,
          ...result.usage,
          problems,
        });
        expect.soft(problems, `${model} · ${f.name}`).toEqual([]);
      }, 600_000);
    }
  }

  it("writes the report", () => {
    mkdirSync("eval-results", { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = `eval-results/analysis-${stamp}.json`;
    writeFileSync(file, JSON.stringify({ models, rows, results }, null, 2));

    console.log("\nmodel | fixture | pass | rating | attempts | tokens in/out");
    for (const r of rows) {
      console.log(
        `${r.model} | ${r.fixture} | ${r.pass ? "PASS" : "FAIL"} | ${r.rating ?? "-"} | ${r.attempts} | ${r.inputTokens}/${r.outputTokens}`,
      );
      for (const p of r.problems) console.log(`    - ${p}`);
    }
    for (const model of models) {
      const mine = rows.filter((r) => r.model === model);
      const tin = mine.reduce((a, r) => a + r.inputTokens, 0);
      const tout = mine.reduce((a, r) => a + r.outputTokens, 0);
      const calls = mine.reduce((a, r) => a + r.llmCalls, 0);
      console.log(`\n${model}: ${mine.filter((r) => r.pass).length}/${mine.length} passed · ${calls} calls · ${tin} in / ${tout} out tokens`);
    }
    console.log(`\nFull report: ${file}`);
  });
});

describe.skipIf(ready)("live analysis evaluation (not configured)", () => {
  it("is skipped: set OPENAI_API_KEY and LLM_ANALYSIS_MODEL (or EVAL_MODELS) in .env.local", () => {});
});
