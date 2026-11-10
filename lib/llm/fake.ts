import type { LLMProvider, StructuredRequest, StructuredResponse } from "./types";

// Test double: returns scripted responses in order and records every request.
export function createFakeProvider(responses: (string | object | Error)[]) {
  const requests: StructuredRequest[] = [];
  let i = 0;
  const provider: LLMProvider = {
    name: "fake",
    async generateStructured(req): Promise<StructuredResponse> {
      requests.push(req);
      const next = responses[i++];
      if (next === undefined) throw new Error("Fake provider: no more scripted responses");
      if (next instanceof Error) throw next;
      const text = typeof next === "string" ? next : JSON.stringify(next);
      return { text, model: req.model, usage: { inputTokens: 100, outputTokens: 50 } };
    },
  };
  return { provider, requests };
}
