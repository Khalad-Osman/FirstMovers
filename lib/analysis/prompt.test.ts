import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analysisInputSchema } from "./types";
import { FIXTURES } from "./fixtures";
import { buildSystemPrompt, buildUserMessage, EXCERPT_LIMIT, MODEL_FILE, RULES_FILE } from "./prompt";

const read = (p: string) => readFileSync(p, "utf8");

describe("system prompt", () => {
  const system = buildSystemPrompt();

  it("starts with docs/intelligence-model.md word for word", () => {
    expect(system.startsWith(read(MODEL_FILE))).toBe(true);
  });

  it("contains docs/analysis-rules.md word for word", () => {
    expect(system).toContain(read(RULES_FILE));
  });

  it("analysis-rules.md matches CLAUDE.md section 7 exactly", () => {
    const claude = read("CLAUDE.md").replace(/\r\n/g, "\n");
    const section = claude.split(/^## 7\. Analysis rules[^\n]*\n/m)[1].split(/^## 8\./m)[0].trim();
    const rules = read(RULES_FILE).replace(/\r\n/g, "\n").replace(/^# Analysis rules\n/, "").trim();
    expect(rules).toBe(section);
  });
});

describe("user message", () => {
  const parse = (name: string) => analysisInputSchema.parse(FIXTURES.find((f) => f.name === name)!.input);

  it("wraps every source in its own delimiter with the computed tier", () => {
    const msg = buildUserMessage(parse("historical-only"));
    expect(msg.match(/<source id=/g)).toHaveLength(2);
    expect(msg).toContain('id="S1"');
    expect(msg).toContain('tier="historical"');
    expect(msg).toContain("Analysis date: 2026-11-10");
  });

  it("stops a source from closing its delimiter or opening a fake one", () => {
    const msg = buildUserMessage(parse("prompt-injection"));
    expect(msg.match(/<\/source>/g)).toHaveLength(2); // only our own closing tags
    expect(msg.match(/<source id=/g)).toHaveLength(2);
    expect(msg).not.toContain('<source id="S9"');
  });

  it("truncates long excerpts", () => {
    const input = parse("historical-only");
    input.sources[0].excerpt = "x".repeat(EXCERPT_LIMIT + 500);
    const msg = buildUserMessage(input);
    expect(msg).toContain("[excerpt truncated]");
    expect(msg).not.toContain("x".repeat(EXCERPT_LIMIT + 1));
  });

  it("all fixtures are valid analysis inputs", () => {
    for (const f of FIXTURES) expect(analysisInputSchema.safeParse(f.input).success, f.name).toBe(true);
  });
});
