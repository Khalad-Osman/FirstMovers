import "server-only";
import { createOpenAIProvider } from "./openai";
import type { LLMProvider } from "./types";

export type { LLMProvider, StructuredRequest, StructuredResponse, Usage, ChatMessage } from "./types";
export { LLMError } from "./types";
export { toStrictJsonSchema } from "./json-schema";

// Provider and model names come from configuration, never from call sites.
// Precedence: settings table (admin-editable, Phase 6) > env > error.

export type ModelRole = "screening" | "analysis";

export function getProvider(env: NodeJS.ProcessEnv = process.env): LLMProvider {
  // Trim: values pasted into a hosting dashboard often carry stray spaces.
  const name = (env.LLM_PROVIDER?.trim() || "openai").toLowerCase();
  switch (name) {
    case "openai": {
      const apiKey = env.OPENAI_API_KEY?.trim();
      if (!apiKey) throw new Error("OPENAI_API_KEY is not set (.env.local or Vercel env).");
      return createOpenAIProvider({ apiKey });
    }
    default:
      // Adding a provider = one adapter file implementing LLMProvider + a case here.
      throw new Error(`Unsupported LLM_PROVIDER "${name}". Supported: openai.`);
  }
}

export function resolveModel(
  role: ModelRole,
  settings?: { screening_model?: string | null; analysis_model?: string | null } | null,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const fromSettings = role === "screening" ? settings?.screening_model : settings?.analysis_model;
  const fromEnv = role === "screening" ? env.LLM_SCREENING_MODEL : env.LLM_ANALYSIS_MODEL;
  const model = fromSettings?.trim() || fromEnv?.trim();
  if (!model) {
    throw new Error(
      `No ${role} model configured. Set ${role === "screening" ? "LLM_SCREENING_MODEL" : "LLM_ANALYSIS_MODEL"} or the settings table.`,
    );
  }
  return model;
}
