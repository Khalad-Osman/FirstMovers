import { describe, expect, it } from "vitest";
import { fromStrings, parseDelimited, textChunks } from "./csv";

async function all(parts: string[], d = ",") {
  const out: Record<string, string>[] = [];
  for await (const r of parseDelimited(fromStrings(parts), d)) out.push(r);
  return out;
}

describe("parseDelimited", () => {
  it("parses quoted fields with commas, escaped quotes and newlines", async () => {
    const rows = await all(['﻿"a","b","c"\r\n', '"1, one","say ""hi""","multi\nline"\r\n', "2,x,y\r\n"]);
    expect(rows).toEqual([
      { a: "1, one", b: 'say "hi"', c: "multi\nline" },
      { a: "2", b: "x", c: "y" },
    ]);
  });

  it("handles rows split across chunk boundaries, including inside quotes", async () => {
    const rows = await all(['h1,h2\n"ab', 'c""d",e', "f\n", 'g,"h"', ""]);
    expect(rows).toEqual([
      { h1: 'abc"d', h2: "ef" },
      { h1: "g", h2: "h" },
    ]);
  });

  it("supports tab-delimited input and skips blank lines", async () => {
    expect(await all(["x\ty\n\n1\t2\n"], "\t")).toEqual([{ x: "1", y: "2" }]);
  });

  it("fills missing trailing columns with empty strings", async () => {
    expect(await all(["a,b,c\n1\n"])).toEqual([{ a: "1", b: "", c: "" }]);
  });

  it("decodes UTF-16LE streams (Job Bank format)", async () => {
    const buf = Buffer.from("﻿name\tcity\nAcme\tToronto\n", "utf16le");
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(buf.subarray(0, 7))); // split mid-character
        c.enqueue(new Uint8Array(buf.subarray(7)));
        c.close();
      },
    });
    const out: Record<string, string>[] = [];
    for await (const r of parseDelimited(textChunks(stream, "utf-16le"), "\t")) out.push(r);
    expect(out).toEqual([{ name: "Acme", city: "Toronto" }]);
  });
});
