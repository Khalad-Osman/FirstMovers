import "server-only";
import { LLMError, type LLMProvider, type StructuredRequest, type StructuredResponse } from "./types";

// OpenAI adapter using plain fetch (no SDK). Chat Completions with strict
// JSON-schema structured output. Server-only: the key never reaches a browser.

const ENDPOINT = "https://api.openai.com/v1/chat/completions";
const TIMEOUT_MS = 180_000;
const MAX_ATTEMPTS = 4; // 1 try + 3 retries on 429 / 5xx / network errors

type Options = {
  apiKey: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function backoffMs(attempt: number, retryAfter: string | null): number {
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60_000);
  return Math.min(1000 * 2 ** attempt, 30_000) + Math.floor(Math.random() * 250);
}

export function createOpenAIProvider({ apiKey, fetchImpl = fetch, sleep = defaultSleep }: Options): LLMProvider {
  return {
    name: "openai",
    async generateStructured(req: StructuredRequest): Promise<StructuredResponse> {
      const body = JSON.stringify({
        model: req.model,
        messages: [{ role: "system", content: req.system }, ...req.messages],
        response_format: {
          type: "json_schema",
          json_schema: { name: req.schemaName, schema: req.jsonSchema, strict: true },
        },
      });

      let lastError: LLMError | null = null;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        let res: Response;
        try {
          res = await fetchImpl(ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body,
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
        } catch (e) {
          lastError = new LLMError(`OpenAI request failed: ${e instanceof Error ? e.message : String(e)}`, undefined, true);
          await sleep(backoffMs(attempt, null));
          continue;
        }

        if (res.status === 429 || res.status >= 500) {
          lastError = new LLMError(`OpenAI returned ${res.status}`, res.status, true);
          await sleep(backoffMs(attempt, res.headers.get("retry-after")));
          continue;
        }

        const json = (await res.json().catch(() => null)) as OpenAIChatResponse | null;
        if (!res.ok) {
          // Never include request headers (the key) in errors.
          const msg = json?.error?.message ?? `HTTP ${res.status}`;
          throw new LLMError(`OpenAI error: ${msg}`, res.status, false);
        }

        const choice = json?.choices?.[0];
        if (choice?.message?.refusal) throw new LLMError(`Model refused: ${choice.message.refusal}`);
        const text = choice?.message?.content;
        if (typeof text !== "string" || !text.trim()) throw new LLMError("OpenAI returned an empty response");
        if (choice?.finish_reason === "length") throw new LLMError("Model output was cut off (length limit)");

        return {
          text,
          model: json?.model ?? req.model,
          usage: {
            inputTokens: json?.usage?.prompt_tokens ?? 0,
            outputTokens: json?.usage?.completion_tokens ?? 0,
          },
        };
      }
      throw lastError ?? new LLMError("OpenAI request failed");
    },
  };
}

type OpenAIChatResponse = {
  model?: string;
  choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};
