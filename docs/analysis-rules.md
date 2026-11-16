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
- The rating must be consistent with the countercase and unknowns. If the brief itself says an external transaction is unverified and alternatives are likely, it is not Strong Signal.
- **No Meaningful Signal** is a valid, expected outcome. Keep those briefs short; don't fill sections to look busy.

**Space likely to be vacated**
- When the sources show a new, acquired, built or fitted-out facility and also place the company at another Ontario address, assess whether that other address is likely to be vacated, sublet or sold. This is a separate opportunity (backfill, sublease or disposition) and does not change the rating, which is about a new requirement.
- **Likely** needs a source for the new facility and a source placing the company at the other address, with nothing showing the other site is kept. Use **Possible** when the relationship between the sites is unclear (it may replace or supplement). Otherwise **Not indicated**.
- Never invent the other site's size, lease terms, tenure, timing or use. A directory listing establishes an address, not occupancy or tenure.

**Output**
- The LLM returns structured JSON validated with Zod. On validation failure, retry once, then record an error. Never show unvalidated output.
- Before saving a brief, verify in code that every FACT links to a collected source and that its dates match the source record.
