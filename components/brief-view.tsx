import {
  ANGLE_LABEL,
  CHAIN_STEPS,
  DEAL_TYPE_LABEL,
  ORIGIN_LABEL,
  RECENCY_LABEL,
  URGENCY_LABEL,
  VACANCY_LABEL,
  type BriefAnalysis,
  type BrokerAngle,
  type LedgerEntry,
  type Origin,
} from "@/lib/brief/schema";
import { effectiveAngle } from "@/lib/brief/angle";
import { ledgerCounts } from "@/lib/brief/integrity";
import { COMPANY_TYPES, DEAL_TYPES } from "@/lib/research/filters";
import { FIT_LABEL, type FitLevel } from "@/lib/deals/fit";
import { formatDate, normalAddressCase, stripLabel } from "@/lib/format";
import { Cited, SourceLinks } from "./cited-text";
import {
  ChainStatusBadge,
  EvidenceBadge,
  RatingBadge,
  RelevanceBadge,
  SampleBadge,
  StageBadge,
} from "./badges";

export const FIT_CLASS: Record<FitLevel, string> = { high: "badge-supported", medium: "badge-signal", low: "badge-stage", none: "badge-stage" };
export const URGENCY_CLASS: Record<BrokerAngle["urgency"], string> = { act_now: "badge-supported", follow_up: "badge-signal", watch: "badge-stage" };

// Ledger columns from lg up: ID, type, relevance, source, published, event, finding.
const LEDGER_COLS = "lg:grid-cols-[3rem_6.5rem_7.5rem_minmax(0,1.4fr)_8rem_7rem_minmax(0,2fr)] lg:items-start";

const NEXT_ACTION_LABEL: Record<BriefAnalysis["nextStep"]["action"], string> = {
  validate: "Validate",
  monitor: "Monitor",
  investigate: "Investigate another domain",
  discard: "Discard",
};

const mapLink = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(/ontario/i.test(address) ? address : `${address}, Ontario`)}`;
const webLink = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

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
  // Past deal fit (code, not AI). `matches` (deal descriptions) only for admins.
  fit?: { level: FitLevel; reason: string; matches?: string[] } | null;
};

export function BriefView({ analysis, companyName, isSample, analyzedAt, origin, surfacedBy, version, actions, aside, fit }: Props) {
  const counts = ledgerCounts(analysis);
  const ids = new Set(analysis.ledger.map((e) => e.id));
  const t = (text: string, label?: string) => <Cited text={label ? stripLabel(text, label) : text} ids={ids} />;

  // Repeat coverage is shown under the entry it repeats (one signal, one row).
  const repeatsOf = new Map<string, LedgerEntry[]>();
  for (const e of analysis.ledger) {
    if (e.repeatCoverageOf && ids.has(e.repeatCoverageOf)) repeatsOf.set(e.repeatCoverageOf, [...(repeatsOf.get(e.repeatCoverageOf) ?? []), e]);
  }
  const primaries = analysis.ledger.filter((e) => !(e.repeatCoverageOf && ids.has(e.repeatCoverageOf)));

  const deal = analysis.dealPotential;
  const contacts = analysis.contacts;
  const hasContacts = !!contacts && (contacts.website || contacts.phone || contacts.people.length > 0 || contacts.premises.length > 0);

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

      {deal && (
        <Section title="Deal potential">
          <div className="grid gap-3 border-l-4 border-[var(--accent)] bg-panel px-4 py-3">
            <p className="text-[1.0625rem] font-semibold">
              {t(deal.summary)}
            </p>
            {deal.opportunities.length > 0 && (
              <ul className="grid gap-2.5">
                {deal.opportunities.map((o) => (
                  <li key={`${o.dealType}-${o.description}`} className="grid gap-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="badge badge-stage">{DEAL_TYPE_LABEL[o.dealType]}</span>
                      {o.statedSize && <span className="mono text-[0.875rem]">{o.statedSize}</span>}
                      {o.location && <span className="text-[0.875rem] text-meta">{normalAddressCase(o.location)}</span>}
                    </p>
                    <p className="text-[0.9375rem]">
                      {t(o.description)} <SourceLinks ids={o.sourceIds.filter((id) => ids.has(id))} />
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[0.8125rem] text-meta">
              What a broker could pursue if the evidence holds, not a claim that a deal exists. Sizes and places are as the cited sources state them.
            </p>
          </div>
        </Section>
      )}

      {(() => {
        const angle = effectiveAngle(analysis, analyzedAt);
        return (
          <Section title="Broker angle">
            <div className="grid gap-2 border-l-4 border-line bg-panel px-4 py-3">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{ANGLE_LABEL[angle.type]}</span>
                <span className={`badge ${URGENCY_CLASS[angle.urgency]}`}>{URGENCY_LABEL[angle.urgency]}</span>
              </p>
              <p className="text-[1.0625rem]">
                {t(angle.headline)}
              </p>
              {angle.talkingPoints.length > 0 && (
                <ul className="grid list-disc gap-1 pl-5 text-[0.9375rem]">
                  {angle.talkingPoints.map((p) => (
                    <li key={p.text}>
                      {t(p.text)} <SourceLinks ids={p.sourceIds.filter((id) => ids.has(id))} />
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[0.8125rem] text-meta">
                {angle.derived
                  ? "Worked out in code from this older brief. Re-analyze to get one written from the sources."
                  : "A reason for a conversation, not a claim of a requirement. Urgency comes from the cited sources' dates."}
              </p>
            </div>
          </Section>
        );
      })()}

      <Section title="Company and entity">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="label">Local connection</dt>
            <dd className="mt-0.5">
              {t(analysis.company.localConnection)}
            </dd>
          </div>
          {analysis.company.entityNotes && (
            <div>
              <dt className="label">Entity</dt>
              <dd className="mt-0.5">
                {t(analysis.company.entityNotes)}
              </dd>
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

      {contacts && (
        <Section title="Contacts and premises">
          {hasContacts ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              {contacts.website && (
                <div>
                  <dt className="label">Website</dt>
                  <dd className="mt-0.5 break-words">
                    <a href={webLink(contacts.website.url)} target="_blank" rel="noopener noreferrer nofollow" className="link">
                      {contacts.website.url.replace(/^https?:\/\//i, "")}
                    </a>{" "}
                    <SourceLinks ids={contacts.website.sourceIds.filter((id) => ids.has(id))} />
                  </dd>
                </div>
              )}
              {contacts.phone && (
                <div>
                  <dt className="label">Phone</dt>
                  <dd className="mono mt-0.5">
                    {contacts.phone.number} <SourceLinks ids={contacts.phone.sourceIds.filter((id) => ids.has(id))} />
                  </dd>
                </div>
              )}
              {contacts.people.length > 0 && (
                <div>
                  <dt className="label">People named in the sources</dt>
                  <dd className="mt-0.5">
                    <ul className="grid gap-1">
                      {contacts.people.map((p) => (
                        <li key={p.name}>
                          <strong>{p.name}</strong>
                          {p.role && `, ${p.role}`} <SourceLinks ids={p.sourceIds.filter((id) => ids.has(id))} />
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              )}
              {contacts.premises.length > 0 && (
                <div>
                  <dt className="label">Known Ontario premises</dt>
                  <dd className="mt-0.5">
                    <ul className="grid gap-1">
                      {contacts.premises.map((p) => (
                        <li key={p.address}>
                          <a href={mapLink(p.address)} target="_blank" rel="noopener noreferrer" className="link">
                            {normalAddressCase(p.address)}
                          </a>
                          {p.use && <span className="text-meta"> ({p.use})</span>} <SourceLinks ids={p.sourceIds.filter((id) => ids.has(id))} />
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-meta">The sources don&apos;t give a website, phone, named contact or address.</p>
          )}
          <p className="mt-2 text-[0.8125rem] text-meta">Only what the cited sources state. Check details before calling; building size, owner and lease terms are not in public records.</p>
        </Section>
      )}

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
                <p className="text-[0.9375rem]">
                  {t(step.text, label)}
                </p>
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
          // cards on phones, table-like columns from lg up. Repeat coverage is
          // listed under the entry it repeats, with its own anchor.
          <div className="border border-line text-[0.9375rem]" role="table" aria-label="Evidence ledger">
            <div role="row" className={`${LEDGER_COLS} hidden bg-panel lg:grid`}>
              {["ID", "Type", "Relevance", "Source", "Published", "Event", "Finding"].map((h) => (
                <span key={h} role="columnheader" className="label px-3 py-2">
                  {h}
                </span>
              ))}
            </div>
            {primaries.map((e) => (
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
                    {normalAddressCase(e.title)}
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
                  {t(e.finding)}
                  {(repeatsOf.get(e.id) ?? []).length > 0 && (
                    <div className="mt-2 grid gap-1 border-l-2 border-line pl-3 text-[0.8125rem]">
                      <span className="font-semibold text-meta">Also reported by (one signal, not corroboration):</span>
                      {repeatsOf.get(e.id)!.map((r) => (
                        <span key={r.id} id={`source-${r.id}`}>
                          <span className="mono">{r.id}</span>{" "}
                          <a href={r.url} target="_blank" rel="noopener noreferrer" className="link break-words">
                            {r.publisher}
                          </a>
                          <span className="mono text-meta"> {formatDate(r.publishedAt)}</span>
                        </span>
                      ))}
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
          <List items={analysis.countercase.map((t) => stripLabel(t, "Countercase"))} ids={ids} />
        </Section>
        {analysis.workingHypothesis && (
          <Section title="Working hypothesis">
            <p>
              {t(analysis.workingHypothesis, "Working hypothesis")}
            </p>
          </Section>
        )}
        {analysis.unknowns.length > 0 && (
          <Section title="Unknowns">
            <List items={analysis.unknowns} ids={ids} />
          </Section>
        )}
        {analysis.commercialValue && (
          <Section title="Commercial value">
            <p>
              {t(analysis.commercialValue)}
            </p>
          </Section>
        )}
        {analysis.otherPremises && analysis.otherPremises.assessment !== "not_indicated" && (
          <Section title="Space likely to be vacated">
            <p>
              <span className="badge badge-inferred mr-2">{VACANCY_LABEL[analysis.otherPremises.assessment]}</span>
              {analysis.otherPremises.address && <strong>{normalAddressCase(analysis.otherPremises.address)}</strong>}
            </p>
            <p className="mt-2">
              {t(analysis.otherPremises.text, "Space likely to be vacated")}{" "}
              <SourceLinks ids={analysis.otherPremises.sourceIds.filter((id) => ids.has(id))} />
            </p>
            <p className="mt-1 text-[0.8125rem] text-meta">Separate from the rating, which is about a new requirement.</p>
          </Section>
        )}
        <Section title="Decisive next step">
          <p>
            <span className="badge badge-stage mr-2">{NEXT_ACTION_LABEL[analysis.nextStep.action]}</span>
            {t(analysis.nextStep.text)}
          </p>
          {analysis.nextStep.validatingQuestion && (
            <blockquote className="mt-3 border-l-4 border-accent bg-panel px-4 py-3">
              <div className="label">Validating question</div>
              <p className="mt-1">
                {t(analysis.nextStep.validatingQuestion)}
              </p>
            </blockquote>
          )}
        </Section>
      </div>

      <Section title="Signal rating">
        <div className="flex flex-wrap items-center gap-2">
          <RatingBadge rating={analysis.rating} />
          <StageBadge stage={analysis.stage} />
        </div>
        <p className="mt-2">
          {t(analysis.ratingReason, "Signal rating")}
        </p>
      </Section>

      {fit && (
        <Section title="Past deal fit">
          <p>
            <span className={`badge ${FIT_CLASS[fit.level]} mr-2`}>Past deal fit: {FIT_LABEL[fit.level]}</span>
            {fit.reason}
          </p>
          {fit.matches && fit.matches.length > 0 && (
            <ul className="mt-2 grid list-disc gap-1 pl-5 text-[0.9375rem]">
              {fit.matches.map((m) => (
                <li key={m}>Similar to {m}</li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[0.8125rem] text-meta">Compared in code with the team&apos;s past deals. Separate from the signal rating.</p>
        </Section>
      )}
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

function List({ items, ids }: { items: string[]; ids: Set<string> }) {
  return (
    <ul className="grid list-disc gap-1.5 pl-5">
      {items.map((t) => (
        <li key={t}>
          <Cited text={t} ids={ids} />
        </li>
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
