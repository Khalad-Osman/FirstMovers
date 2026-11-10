// Small streaming CSV/TSV reader (RFC 4180 quoting: "" escapes, quoted commas
// and newlines). Handles a leading BOM and CRLF. Yields one object per row keyed
// by header. Decoding (UTF-8 / UTF-16LE) is done by the caller's TextDecoder.

export async function* parseDelimited(
  chunks: AsyncIterable<string>,
  delimiter = ",",
): AsyncGenerator<Record<string, string>> {
  let header: string[] | null = null;
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let quotePending = false; // saw a quote inside quotes; next char decides
  let first = true;

  const endRow = function* (): Generator<Record<string, string>> {
    row.push(field);
    field = "";
    const r = row;
    row = [];
    if (r.length === 1 && r[0] === "") return; // blank line
    if (!header) {
      header = r.map((h) => h.trim());
      return;
    }
    const obj: Record<string, string> = {};
    header.forEach((h, i) => (obj[h] = r[i] ?? ""));
    yield obj;
  };

  for await (let chunk of chunks) {
    if (first) {
      chunk = chunk.replace(/^﻿/, "");
      first = false;
    }
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];
      if (quotePending) {
        quotePending = false;
        if (c === '"') {
          field += '"';
          continue;
        }
        inQuotes = false; // closing quote; fall through to handle c normally
      }
      if (inQuotes) {
        if (c === '"') quotePending = true;
        else field += c;
        continue;
      }
      if (c === '"' && field === "") inQuotes = true;
      else if (c === delimiter) {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        if (field.endsWith("\r")) field = field.slice(0, -1);
        yield* endRow();
      } else field += c;
    }
  }
  if (quotePending) inQuotes = false;
  if (field !== "" || row.length > 0) {
    if (field.endsWith("\r")) field = field.slice(0, -1);
    yield* endRow();
  }
}

// Stream a fetch Response body as decoded text chunks.
export async function* textChunks(body: ReadableStream<Uint8Array>, encoding: "utf-8" | "utf-16le" = "utf-8"): AsyncGenerator<string> {
  const decoder = new TextDecoder(encoding);
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    if (text) yield text;
  }
  const tail = decoder.decode();
  if (tail) yield tail;
}

export async function* fromStrings(parts: string[]): AsyncGenerator<string> {
  for (const p of parts) yield p;
}
