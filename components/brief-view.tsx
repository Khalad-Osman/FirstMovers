import { CHAIN_STEPS, ORIGIN_LABEL, RECENCY_LABEL, VACANCY_LABEL, type BriefAnalysis, type Origin } from "@/lib/brief/schema";
import { ledgerCounts } from "@/lib/brief/integrity";
import { COMPANY_TYPES, DEAL_TYPES } from "@/lib/research/filters";
import { formatDate, stripLabel } from "@/lib/format";
import {
  ChainStatusBadge,
  EvidenceBadge,
  RatingBadge,
  RelevanceBadge,
  SampleBadge,
  StageBadge,
} from "./badges";

// Ledger columns from lg up: ID, type, relevance, source, published, event, finding.
const LEDGER_COLS = "lg:grid-cols-[3rem_6.5rem_7.5rem_minmax(0,1.4fr)_8rem_7rem_minmax(0,2fr)] lg:items-start";

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
    <article className="grid min-w-0 gap-8">
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
          {analysis.companyType && analysis.companyType !== "unknown" && (
            <div>
              <dt className="label">Company type (from sources)</dt>
              <dd className="mt-0.5">{COMPANY_TYPES[analysis.companyType].label}</dd>
            </div>
          )}
          {analysis.dealIndicators && analysis.dealIndicators.length > 0 && (
            <div>
              <dt className="label">Deal indicators (from sources)</dt>
              <dd className="mt-0.5">{analysis.dealIndicators.map((d) => DEAL_TYPES[d]).join(", ")}</dd>
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
                <p className="text-[0.9375rem]">{stripLabel(step.text, label)}</p>
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
          // One element per entry (chain links jump to #source-S1): stacked
          // cards on phones, table-like columns from lg up.
          <div className="border border-line text-[0.9375rem]" role="table" aria-label="Evidence ledger">
            <div role="row" className={`${LEDGER_COLS} hidden bg-panel lg:grid`}>
              {["ID", "Type", "Relevance", "Source", "Published", "Event", "Finding"].map((h) => (
                <span key={h} role="columnheader" className="label px-3 py-2">
                  {h}
                </span>
              ))}
            </div>
            {analysis.ledger.map((e) => (
              <div key={e.id} id={`source-${e.id}`} role="row" className={`${LEDGER_COLS} grid gap-2 border-t border-line p-3 first:border-t-0 lg:gap-0 lg:p-0 lg:first:border-t`}>
                <div role="cell" className="flex flex-wrap items-center gap-2 lg:contents">
                  <span className="mono font-semibold lg:px-3 lg:py-2.5 lg:font-normal">{e.id}</span>
                  <span className="lg:px-3 lg:py-2.5">
                    <EvidenceBadge type={e.evidenceType} />
                  </span>
                  <span className="lg:px-3 lg:py-2.5">
                    <RelevanceBadge relevance={e.relevance} />
                  </span>
                </div>
                <div role="cell" className="min-w-0 lg:px-3 lg:py-2.5">
                  <a href={e.url} target="_blank" rel="noopener noreferrer" className="link break-words">
                    {e.title}
                  </a>
                  <div className="text-[0.8125rem] text-meta">{e.publisher}</div>
                </div>
                <div role="cell" className="mono text-[0.875rem] lg:px-3 lg:py-2.5">
                  <span className="text-meta lg:hidden">Published </span>
                  {formatDate(e.publishedAt)}
                  <div className="text-[0.75rem] text-meta">{RECENCY_LABEL[e.recencyTier]}</div>
                </div>
                <div role="cell" className="mono text-[0.875rem] lg:px-3 lg:py-2.5">
                  <span className="text-meta lg:hidden">Event </span>
                  {e.eventAt ? formatDate(e.eventAt) : "Same as published"}
                </div>
                <div role="cell" className="min-w-0 lg:px-3 lg:py-2.5">
                  {e.finding}
                  {e.repeatCoverageOf && (
                    <div className="mt-1 text-[0.8125rem] font-semibold text-meta">
                      Repeat coverage of {e.repeatCoverageOf}: counted as one signal.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <div className="grid min-w-0 gap-8 lg:grid-cols-2">
        <Section title="Countercase">
          <List items={analysis.countercase.map((t) => stripLabel(t, "Countercase"))} />
        </Section>
        {analysis.workingHypothesis && (
          <Section title="Working hypothesis">
            <p>{stripLabel(analysis.workingHypothesis, "Working hypothesis")}</p>
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
        {analysis.otherPremises && analysis.otherPremises.assessment !== "not_indicated" && (
          <Section title="Space likely to be vacated">
            <p>
              <span className="badge badge-inferred mr-2">{VACANCY_LABEL[analysis.otherPremises.assessment]}</span>
              {analysis.otherPremises.address && <strong>{analysis.otherPremises.address}</strong>}
            </p>
            <p className="mt-2">{stripLabel(analysis.otherPremises.text, "Space likely to be vacated")}</p>
            {analysis.otherPremises.sourceIds.length > 0 && (
              <p className="mono mt-1 text-[0.8125rem] text-meta">
                Sources:{" "}
                {analysis.otherPremises.sourceIds.map((id, i) => (
                  <span key={id}>
                    {i > 0 && ", "}
                    <a href={`#source-${id}`} className="link">
                      {id}
                    </a>
                  </span>
                ))}
              </p>
            )}
            <p className="mt-1 text-[0.8125rem] text-meta">Separate from the rating, which is about a new requirement.</p>
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
        <p className="mt-2">{stripLabel(analysis.ratingReason, "Signal rating")}</p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid min-w-0 content-start gap-3">
      <h2 className="border-b border-line pb-1.5 text-[0.8125rem] font-semibold tracking-[0.06em] text-meta uppercase">
        {title}
      </h2>
      <div className="min-w-0">{children}</div>
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
