import { describe, expect, it, vi } from "vitest";
import { modelOutputSchema } from "@/lib/brief/schema";
import { toStrictJsonSchema } from "./json-schema";
import { createOpenAIProvider } from "./openai";
import { resolveModel } from "./index";
import { LLMError } from "./types";

type Node = Record<string, unknown>;
function walk(node: unknown, visit: (n: Node) => void) {
  if (Array.isArray(node)) node.forEach((n) => walk(n, visit));
  else if (node && typeof node === "object") {
    visit(node as Node);
    Object.values(node).forEach((v) => walk(v, visit));
  }
}

describe("toStrictJsonSchema", () => {
  const schema = toStrictJsonSchema(modelOutputSchema);

  it("closes every object and requires every property", () => {
    let objects = 0;
    walk(schema, (n) => {
      if (n.type === "object" && n.properties) {
        objects++;
        expect(n.additionalProperties).toBe(false);
        expect(n.required).toEqual(Object.keys(n.properties as object));
      }
    });
    expect(objects).toBeGreaterThan(5);
  });

  it("drops keywords strict mode rejects", () => {
    walk(schema, (n) => {
      for (const k of ["minLength", "minItems", "format", "pattern", "$schema"]) expect(n).not.toHaveProperty(k);
    });
  });
});

const REQ = { model: "m", system: "sys", messages: [{ role: "user" as const, content: "hi" }], schemaName: "x", jsonSchema: {} };
const ok = (content: string) =>
  new Response(JSON.stringify({ model: "m-2026", choices: [{ finish_reason: "stop", message: { content } }], usage: { prompt_tokens: 11, completion_tokens: 7 } }), { status: 200 });

describe("OpenAI adapter", () => {
  const sleep = vi.fn(async () => {});

  it("sends a strict json_schema request and returns text + usage", async () => {
    const fetchImpl = vi.fn(async () => ok('{"a":1}'));
    const p = createOpenAIProvider({ apiKey: "sk-test", fetchImpl, sleep });
    const res = await p.generateStructured(REQ);
    expect(res).toEqual({ text: '{"a":1}', model: "m-2026", usage: { inputTokens: 11, outputTokens: 7 } });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.messages[0]).toEqual({ role: "system", content: "sys" });
    expect(body.response_format.json_schema.strict).toBe(true);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
  });

  it("retries 429 and 5xx with backoff", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "2" } }))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(ok("{}"));
    const p = createOpenAIProvider({ apiKey: "sk-test", fetchImpl, sleep });
    await expect(p.generateStructured(REQ)).resolves.toMatchObject({ text: "{}" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("gives up after repeated 429s", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 429 }));
    const p = createOpenAIProvider({ apiKey: "sk-test", fetchImpl, sleep });
    await expect(p.generateStructured(REQ)).rejects.toBeInstanceOf(LLMError);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("does not retry client errors and never leaks the key", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Invalid model" } }), { status: 400 }));
    const p = createOpenAIProvider({ apiKey: "sk-secret-123", fetchImpl, sleep });
    const err = (await p.generateStructured(REQ).catch((e: unknown) => e)) as Error;
    expect(err.message).toContain("Invalid model");
    expect(err.message).not.toContain("sk-secret-123");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("surfaces refusals and truncated output as errors", async () => {
    const refusal = new Response(JSON.stringify({ choices: [{ message: { content: null, refusal: "no" } }] }), { status: 200 });
    const cut = new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: '{"a"' } }] }), { status: 200 });
    const p1 = createOpenAIProvider({ apiKey: "k", fetchImpl: vi.fn(async () => refusal), sleep });
    const p2 = createOpenAIProvider({ apiKey: "k", fetchImpl: vi.fn(async () => cut), sleep });
    await expect(p1.generateStructured(REQ)).rejects.toThrow(/refused/);
    await expect(p2.generateStructured(REQ)).rejects.toThrow(/cut off/);
  });
});

describe("resolveModel", () => {
  it("prefers settings, then env, else throws", () => {
    const env = { LLM_ANALYSIS_MODEL: "env-model" } as unknown as NodeJS.ProcessEnv;
    expect(resolveModel("analysis", { analysis_model: "db-model" }, env)).toBe("db-model");
    expect(resolveModel("analysis", { analysis_model: null }, env)).toBe("env-model");
    expect(() => resolveModel("screening", null, env)).toThrow(/LLM_SCREENING_MODEL/);
  });
});
