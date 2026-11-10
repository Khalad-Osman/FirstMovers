export type ChatMessage = { role: "user" | "assistant"; content: string };

export type Usage = { inputTokens: number; outputTokens: number };

export type StructuredRequest = {
  model: string;
  system: string;
  messages: ChatMessage[];
  schemaName: string;
  jsonSchema: Record<string, unknown>; // strict JSON schema (see ./json-schema.ts)
};

export type StructuredResponse = {
  // Raw text returned by the model (expected to be JSON); parsing and Zod
  // validation happen in the caller so that failures can be retried.
  text: string;
  usage: Usage;
  model: string; // model actually used, as reported by the provider
};

export interface LLMProvider {
  readonly name: string;
  generateStructured(req: StructuredRequest): Promise<StructuredResponse>;
}

export class LLMError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "LLMError";
  }
}
