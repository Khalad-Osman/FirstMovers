# Analysis rules

These rules apply on top of `docs/intelligence-model.md`.

**Evidence**
- Every ledger entry has two separate labels:
  - **Evidence type:** FACT / INFERENCE / HYPOTHESIS / UNKNOWN
  - **Relevance:** Signal / Context / Not relevant
- Only **Signal** entries drive the chain and the rating. A source can be factual and still not relevant.
- Every FACT must link to a collected source. Never add facts not present in the sources.
- Never invent facility sizes, lease dates, contract values, probabilities, timing ranges, locations or utilization.
- Record publication date and event date separately where both exist.
- Repeated coverage of the same event (for example, a provincial release and an agency release about one program) is **one signal**, not independent corroboration. Flag it as such.

**Recency tiers**
- Sources from the **last 12 months** can support "What changed".
- Sources **12–24 months** old are **Context**: treat them as known public programs and look for recent follow-up signals (site selection, hiring, equipment, construction, production start).
- Sources **over 24 months** old are **Historical**: exclude them unless they explain a current development.
- No chain step is "Supported" by historical sources alone.
- An announced, site-controlled or opened facility is context, not an undiscovered early requirement.

**Entity and locality**
- Always keep the company's **full name** as it appears in the source (Holdings, Inc., Ltd., Manufacturing and so on).
- Don't reject a candidate because its name resembles a person's name. Confirm from the sources that it is an operating business with Ontario operations. If that can't be confirmed, mark it **Entity not verified**: list it in the run summary, not in the feed.
- Global or US activity is not an Ontario signal without a credible local connection. Mark it Not relevant.

**Countercase**
- Always consider alternatives to an external transaction: unused capacity, expansion in place, retooling, additional shifts, automation, racking, 3PL, outsourcing.
- Investment in existing facilities is evidence **against** an external move. Say so explicitly when present.

**Ratings**
- **Strong Signal** requires a specific, recent, Ontario facility or capacity signal with a plausible forcing event.
- **Worth Monitoring** (defined 2026-11-18): a specific, recent Ontario facility signal (a permit, grant, contract or announced project for this company) with a plausible path to more space or a property decision, even when facility pressure or a forcing event is not yet shown. Physical investment at existing premises still qualifies when it points to growth; the countercase records that it argues against an external move. Use No Meaningful Signal when there is no recent Ontario facility signal, or the only change is routine (a sign, a minor repair or a replacement).
- The rating must be consistent with the countercase and unknowns. If the brief itself says an external transaction is unverified and alternatives are likely, it is not Strong Signal.
- **No Meaningful Signal** is a valid, expected outcome. Keep those briefs short; don't fill sections to look busy.

**Space likely to be vacated**
- When the sources show a new, acquired, built or fitted-out facility and also place the company at another Ontario address, assess whether that other address is likely to be vacated, sublet or sold. This is a separate opportunity (backfill, sublease or disposition) and does not change the rating, which is about a new requirement.
- **Likely** needs a source for the new facility and a source placing the company at the other address, with nothing showing the other site is kept. Use **Possible** when the relationship between the sites is unclear (it may replace or supplement). Otherwise **Not indicated**.
- Never invent the other site's size, lease terms, tenure, timing or use. A directory listing establishes an address, not occupancy or tenure.

**Broker angle**
- Every brief states a broker angle: the most useful reason for a conversation that the evidence supports. Types: **new requirement** (an external space need; only when the rating is Worth Monitoring or Strong Signal), **vacated space** (only when vacated space is likely or possible), **capacity conversation** (investment or expansion at existing premises: ask about future space needs), **relationship** (funding, ownership, leadership or similar trigger to reconnect, without implying a property need), or **monitor only**.
- The angle is a reason to talk, not a claim. It must not imply a requirement the rating doesn't support, and every talking point cites the sources it rests on. Never state timing; urgency is computed from the sources' dates.

**Deal potential**
- Every brief states its deal potential: the transactions a broker could pursue if the evidence holds (site search, land purchase, build-to-suit, lease, purchase, sublease, disposition, backfill, lease renewal, expansion in place). It is separate from the rating and is not a claim that a deal exists.
- New-space deals (site search, land purchase, build-to-suit, lease, purchase) only when the rating is Worth Monitoring or Strong Signal, and not for a facility the sources show is already site-controlled, built or open. Sublease, disposition or backfill only when vacated space is likely or possible.
- State a size or a location only as a cited source states it.

**Contacts and premises**
- List the company's website, main phone, named people and known Ontario addresses only when a source states them, each with the source. Never guess a contact, a title or an address.

**Writing for brokers**
- Write for an industrial real-estate broker: plain words, the opportunity first. The countercase and unknowns carry the caveats; don't repeat them in every section.
- Offer only brokerage services (site search, land acquisition, build-to-suit, lease or buy analysis, lease negotiation and renewal, sublease, disposition, backfill), never operations, engineering or facility-planning consulting.

**Output**
- The LLM returns structured JSON validated with Zod. On validation failure, retry once, then record an error. Never show unvalidated output.
- Before saving a brief, verify in code that every FACT links to a collected source and that its dates match the source record.
