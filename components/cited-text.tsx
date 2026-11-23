import { citationParts, normalAddressCase } from "@/lib/format";

// Model text with source ids written inline ("(S1, S3)", "S5 places …") shown
// as small links to the evidence ledger, and capitalised permit addresses in
// normal case. Ids not in this brief's ledger stay as plain text.
export function Cited({ text, ids }: { text: string; ids: Set<string> }) {
  const parts = citationParts(normalAddressCase(text), ids);
  return (
    <>
      {parts.map((p, i) =>
        "text" in p ? (
          <span key={i}>{p.text}</span>
        ) : (
          <SourceLinks key={i} ids={p.ids} />
        ),
      )}
    </>
  );
}

export function SourceLinks({ ids }: { ids: string[] }) {
  if (!ids.length) return null;
  return (
    <span className="mono text-[0.75rem] whitespace-nowrap text-meta">
      [
      {ids.map((id, j) => (
        <span key={id}>
          {j > 0 && ", "}
          <a href={`#source-${id}`} className="link">
            {id}
          </a>
        </span>
      ))}
      ]
    </span>
  );
}
