import { CHAIN_STEPS, ORIGIN_LABEL, type BriefAnalysis, type Origin } from "@/lib/brief/schema";
import { ledgerCounts } from "@/lib/brief/integrity";
import { formatDate } from "@/lib/format";
import {
  ChainStatusBadge,
  EvidenceBadge,
  RatingBadge,
  RelevanceBadge,
  SampleBadge,
  StageBadge,
} from "./badges";

const NEXT_ACTION_LABEL: Record<BriefAnalysis["nextStep"]["action"], string> = {
  validate: "Validate",
  monitor: "Monitor",
  investigate: "Investigate another domain",
  discard: "Discard",
};

type Props = {
  analysis: BriefAnalysis;
  companyName: string;
  isSample: boolean;
  analyzedAt: string;
  origin: Origin;
  surfacedBy: string | null;
  version?: number;
  actions?: React.ReactNode;
  aside?: React.ReactNode; // versions list, notices
};

export function BriefView({ analysis, companyName, isSample, analyzedAt, origin, surfacedBy, version, actions, aside }: Props) {
  const counts = ledgerCounts(analysis);
  const ids = new Set(analysis.ledger.map((e) => e.id));

  return (
    <article className="grid gap-8">
      {isSample && (
        <p className="border-l-4 border-[#4338ca] bg-[#eef2ff] px-4 py-3 text-[0.9375rem] text-ink">
          <strong>Sample brief.</strong> This company and its sources are fictional. It shows how a brief is laid out
          and is not stored in the database.
        </p>
      )}

      <header className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {isSample && <SampleBadge />}
          <RatingBadge rating={analysis.rating} />
          <StageBadge stage={analysis.stage} />
        </div>
        <h1 className="text-2xl font-bold text-balance sm:text-[1.75rem]">{companyName}</h1>
        <div className="mono flex flex-wrap gap-x-5 gap-y-1 text-[0.8125rem] text-meta">
          <span>Analyzed {formatDate(analyzedAt)}</span>
          {version !== undefined && <span>Version {version}</span>}
          <span>{ORIGIN_LABEL[origin]}</span>
          {surfacedBy && <span>Surfaced by: {surfacedBy}</span>}
        </div>
        <dl className="flex flex-wrap gap-2" aria-label="Source counts">
          <Count label="Signal" value={counts.signal} />
          <Count label="Context" value={counts.context} />
          <Count label="Not relevant" value={counts.not_relevant} />
        </dl>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        {aside}
      </header>

      <Section title="Company and entity">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="label">Local connection</dt>
            <dd className="mt-0.5">{analysis.company.localConnection}</dd>
          </div>
          {analysis.company.entityNotes && (
            <div>
              <dt className="label">Entity</dt>
              <dd className="mt-0.5">{analysis.company.entityNotes}</dd>
            </div>
          )}
        </dl>
      </Section>

      <Section title="Five-step chain">
        <ol className="grid gap-2 lg:grid-cols-5">
          {CHAIN_STEPS.map(([key, label], i) => {
            const step = analysis.chain[key];
            return (
              <li key={key} className="grid content-start gap-2 border border-line bg-panel p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[0.875rem] font-semibold">
                    <span className="mono text-meta">{i + 1}.</span> {label}
                  </span>
                  <ChainStatusBadge status={step.status} />
                </div>
                <p className="text-[0.9375rem]">{step.text}</p>
                {step.sourceIds.length > 0 && (
                  <p className="mono text-[0.8125rem] text-meta">
                    Sources:{" "}
                    {step.sourceIds.map((id, j) => (
                      <span key={id}>
                        {j > 0 && ", "}
                        {ids.has(id) ? (
                          <a href={`#source-${id}`} className="link">
                            {id}
                          </a>
                        ) : (
                          id
                        )}
                      </span>
                    ))}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </Section>

      <Section title="Evidence ledger">
        {analysis.ledger.length === 0 ? (
          <p className="text-meta">No sources were collected for this brief.</p>
        ) : (
          <div className="overflow-x-auto border border-line">
            <table className="w-full min-w-[760px] border-collapse text-left text-[0.9375rem]">
              <thead className="bg-panel">
                <tr>
                  <Th>ID</Th>
                  <Th>Type</Th>
                  <Th>Relevance</Th>
                  <Th>Source</Th>
                  <Th>Published</Th>
                  <Th>Event</Th>
                  <Th>Finding</Th>
                </tr>
              </thead>
              <tbody>
                {analysis.ledger.map((e) => (
                  <tr key={e.id} id={`source-${e.id}`} className="border-t border-line align-top">
                    <Td className="mono">{e.id}</Td>
                    <Td><EvidenceBadge type={e.evidenceType} /></Td>
                    <Td><RelevanceBadge relevance={e.relevance} /></Td>
                    <Td>
                      <a href={e.url} target="_blank" rel="noopener noreferrer" className="link">
                        {e.title}
                      </a>
                      <div className="text-[0.8125rem] text-meta">{e.publisher}</div>
                    </Td>
                    <Td className="mono whitespace-nowrap">{formatDate(e.publishedAt)}</Td>
                    <Td className="mono whitespace-nowrap">{e.eventAt ? formatDate(e.eventAt) : "Same"}</Td>
                    <Td>
                      {e.finding}
                      {e.repeatCoverageOf && (
                        <div className="mt-1 text-[0.8125rem] font-semibold text-meta">
                          Repeat coverage of {e.repeatCoverageOf}: counted as one signal.
                        </div>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Countercase">
          <List items={analysis.countercase} />
        </Section>
        {analysis.workingHypothesis && (
          <Section title="Working hypothesis">
            <p>{analysis.workingHypothesis}</p>
          </Section>
        )}
        {analysis.unknowns.length > 0 && (
          <Section title="Unknowns">
            <List items={analysis.unknowns} />
          </Section>
        )}
        {analysis.commercialValue && (
          <Section title="Commercial value">
            <p>{analysis.commercialValue}</p>
          </Section>
        )}
        <Section title="Decisive next step">
          <p>
            <span className="badge badge-stage mr-2">{NEXT_ACTION_LABEL[analysis.nextStep.action]}</span>
            {analysis.nextStep.text}
          </p>
          {analysis.nextStep.validatingQuestion && (
            <blockquote className="mt-3 border-l-4 border-accent bg-panel px-4 py-3">
              <div className="label">Validating question</div>
              <p className="mt-1">{analysis.nextStep.validatingQuestion}</p>
            </blockquote>
          )}
        </Section>
      </div>

      <Section title="Signal rating">
        <div className="flex flex-wrap items-center gap-2">
          <RatingBadge rating={analysis.rating} />
          <StageBadge stage={analysis.stage} />
        </div>
        <p className="mt-2">{analysis.ratingReason}</p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid content-start gap-3">
      <h2 className="border-b border-line pb-1.5 text-[0.8125rem] font-semibold tracking-[0.06em] text-meta uppercase">
        {title}
      </h2>
      <div>{children}</div>
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="grid list-disc gap-1.5 pl-5">
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-2 border border-line px-3 py-1.5">
      <dt className="text-[0.875rem] text-meta">{label}</dt>
      <dd className="mono text-base font-semibold">{value}</dd>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="label px-3 py-2 font-semibold">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 ${className}`}>{children}</td>;
}
