import { z } from "zod";

// Convert a Zod schema to a JSON schema accepted by strict structured-output
// modes: every object closed (additionalProperties: false) with all properties
// required, and validation keywords that strict modes reject removed. Zod still
// validates the full constraints after the response comes back.
const DROP_KEYS = new Set([
  "$schema",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
]);

function strictify(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strictify);
  if (!node || typeof node !== "object") return node;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (DROP_KEYS.has(k)) continue;
    out[k] = strictify(v);
  }
  if (out.type === "object" && out.properties && typeof out.properties === "object") {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties as object);
  }
  return out;
}

export function toStrictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return strictify(z.toJSONSchema(schema, { io: "output" })) as Record<string, unknown>;
}
