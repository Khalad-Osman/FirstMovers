import { describe, expect, it } from "vitest";
import { signalWeight, type SignalForCandidate } from "@/lib/discovery/candidates";
import { familyOf, isPhysical } from "@/lib/prospects";
import { recordExcerpt, toRecordSource, type RecordSignal } from "@/lib/research/records";
import { eroApprovals, eroId, legalName, mapNotice, parseEroId, parseNotice, placeFrom, type EroNotice } from "./ero";
import { companiesIn, datelineCity, jobsFrom, mapRelease, moneyFrom, placeIn, type NewsRelease } from "./ontario-news";
import type { IngestContext, IngestItem, SignalRow } from "./types";

const ctx = { today: "2026-11-18", cutoff: "2025-11-18" };
const rowOf = (items: IngestItem | IngestItem[]): SignalRow[] => (Array.isArray(items) ? items : [items]).filter((i): i is { row: SignalRow } => "row" in i).map((i) => i.row);

// ---------- Ontario newsroom ----------
const release = (over: Partial<NewsRelease> = {}): NewsRelease => ({
  id: 1007999,
  language: "en",
  release_date_time: "2026-11-10 10:00:00",
  ministry_acronym: "MEDJCT",
  ministry_name: "Economic Development, Job Creation and Trade",
  content_title: "Ontario Welcomes More Than $44 Million Advanced Manufacturing Investment in Oakville",
  content_lead: "OAKVILLE — The Ontario government is welcoming a $44 million investment from Concast Pipe Inc. , a leading supplier of precast concrete products, to establish a new, state-of-the-art manufacturing facility in Oakville that will create 60 new jobs.",
  content_body: "<p>The new facility will expand production.</p>",
  ...over,
});

describe("Ontario newsroom", () => {
  it("keeps a named company's new facility investment, with amount, jobs and city", () => {
    const [r] = rowOf(mapRelease(release(), ctx));
    expect(r).toMatchObject({
      source_type: "ontario_news",
      raw_entity_name: "Concast Pipe Inc.",
      entity_key: "concast pipe",
      signal_strength: "announcement",
      published_at: "2026-11-10",
      location: "Oakville, Ontario",
      url: "https://news.ontario.ca/en/release/1007999",
    });
    expect(r.raw).toMatchObject({ amount: 44_000_000, jobs: 60, kind: "new_facility" });
  });

  it("uses a place in the title when there's no dateline", () => {
    const [r] = rowOf(mapRelease(release({ content_title: "Ontario Welcomes $141 Million Investment in Brampton from Coca-Cola Canada Bottling", content_lead: "The Ontario government is welcoming a $141 million investment from Coca-Cola Canada Bottling Ltd. to expand its plant." }), ctx));
    expect(r).toMatchObject({ raw_entity_name: "Coca-Cola Canada Bottling Ltd.", location: "Brampton, Ontario" });
  });

  it.each([
    [{ content_title: "Ontario Taking the Next Step to Expand Stevenson Memorial Hospital", content_lead: "TORONTO — Pomerleau Inc. will build a $100 million new facility." }, "public construction project"],
    [{ content_title: "Ontario Expands Rural High-Speed Internet in Bruce and Grey Counties", content_lead: "WEST GREY — A $40 million investment with EH!tel Networks Inc. expands broadband to new homes." }, "public construction project"],
    [{ content_title: "Ontario Investing $4.8 Million to Protect and Train Workers", content_lead: "AURORA — Through the Skills Development Fund, an investment of $4.8 million to Acme Inc. to expand." }, "training or grant programme"],
    [{ content_lead: "TORONTO — Northern Ontario Heritage Fund Corporation is investing $2 million to expand a new facility." }, "no company named in the headline or lead"],
    [{ content_title: "Ontario Updates Regulations", content_lead: "TORONTO — The government updated rules." }, "no company investment or facility"],
    [{ language: "fr" }, "not English"],
    [{ release_date_time: "2025-01-01 10:00:00" }, "older than 12 months"],
  ])("skips %o", (over, reason) => {
    expect(mapRelease(release(over), ctx)).toEqual([{ skip: reason }]);
  });

  it("parses amounts, jobs, datelines, places and company names", () => {
    expect(moneyFrom("a $533 million investment")).toBe(533_000_000);
    expect(moneyFrom("$1.2 billion")).toBe(1_200_000_000);
    expect(jobsFrom("creating more than 1,200 new jobs")).toBe(1200);
    expect(datelineCity("MISSISSAUGA — The government")).toBe("Mississauga");
    expect(datelineCity("The government")).toBeNull();
    expect(placeIn("investment in Hamilton")).toBe("Hamilton");
    expect(companiesIn("investment from Lee Li Holdings Inc. and Ontario Power Generation Inc.")).toEqual(["Lee Li Holdings Inc."]);
  });
});

// ---------- Environmental Registry ----------
const page = (o: { title: string; type: string; stage?: string; posted?: string; address?: string; details: string }) => `
<html><body><h1 class="title">${o.title}</h1>
<div>Instrument type: ${o.type}</div><div>ERO number 026-1152</div><div>Notice type Instrument</div>
<div>Notice stage ${o.stage ?? "Proposal"}</div><div>${o.stage ?? "Proposal"} posted ${o.posted ?? "November 6, 2026"}</div>
<div>Proposal summary Short summary. On this page</div>
<div>Location details Site address ${o.address ?? "2714 Bristol Circle Oakville, ON L6H 6A1 Canada"} Site location map</div>
<div>Proponent(s) Pinty&#039;s Delicious Foods Inc. 5063 North Service Road Burlington, ON</div>
<div>Proposal details ${o.details} Supporting materials View materials</div>
</body></html>`;

describe("Environmental Registry", () => {
  const pinty = parseNotice("026-1152", page({ title: "Pinty&#039;s Delicious Foods Inc. - Environmental Compliance Approval (air)", type: "Environmental Compliance Approval (air)", details: "This proposal is to amend the approval to replace Line 3 dust collector with a scrubber." }));

  it("reads a notice page's labelled fields", () => {
    expect(pinty).toMatchObject<Partial<EroNotice>>({
      title: "Pinty's Delicious Foods Inc. - Environmental Compliance Approval (air)",
      instrumentType: "Environmental Compliance Approval (air)",
      stage: "Proposal",
      posted: "2026-11-06",
      proponent: "Pinty's Delicious Foods Inc.",
      siteAddress: "2714 Bristol Circle Oakville, ON L6H 6A1 Canada",
    });
  });

  it("maps an air approval to a signal with a normalised location", () => {
    const [r] = rowOf(mapNotice(pinty, ctx));
    expect(r).toMatchObject({
      source_type: "ero_approval",
      source_record_id: "026-1152",
      raw_entity_name: "Pinty's Delicious Foods Inc.",
      signal_strength: "env_approval",
      published_at: "2026-11-06",
      location: "2714 Bristol Circle, Oakville, Ontario",
      url: "https://ero.ontario.ca/notice/026-1152",
    });
    expect(r.raw).toMatchObject({ kind: "change", city: "Oakville", stage: "Proposal" });
  });

  it("classifies growth language", () => {
    const n = { ...pinty, details: "This proposal is for a new Environmental Compliance Approval for an additional production line." };
    expect(rowOf(mapNotice(n, ctx))[0].raw).toMatchObject({ kind: "growth" });
  });

  it.each([
    [{ instrumentType: "Permit to take water", title: "Forgehill Equities Inc. - Permit to take water" }, "not an air or multi-media approval"],
    [{ title: "1000792458 Ontario Ltd. - Environmental Compliance Approval (air)", details: "a cremation facility" }, "not an industrial occupier"],
    [{ title: "Kiley Paving Ltd. - Environmental Compliance Approval (air)" }, "not an industrial occupier"],
    [{ posted: "2025-01-01" }, "older than 12 months"],
  ])("skips %o", (over, reason) => {
    expect(mapNotice({ ...pinty, ...over }, ctx)).toEqual({ skip: reason });
  });

  it("handles ids and addresses", () => {
    expect(eroId(2026, 7)).toBe("026-0007");
    expect(parseEroId("025-1426")).toEqual({ year: 2025, n: 1426 });
    expect(placeFrom("850 McKay Road Pickering, ON Canada")).toEqual({ city: "Pickering", location: "850 McKay Road, Pickering, Ontario" });
    expect(placeFrom("2150A Drew Road Mississauga, ON Canada").city).toBe("Mississauga");
  });

  it("scans forward from the newest stored notice and stops after a run of missing numbers", async () => {
    const pages: Record<string, string> = {
      "026-1153": page({ title: "Acme Coatings Inc. - Environmental Compliance Approval (air)", type: "Environmental Compliance Approval (air)", posted: "November 10, 2026", details: "Additional spray booth." }),
      "026-1155": page({ title: "Beta Water Inc. - Permit to take water", type: "Permit to take water", details: "Water." }),
    };
    const requested: string[] = [];
    const fetchImpl = (async (url: string) => {
      const id = url.split("/").pop()!;
      requested.push(id);
      return pages[id] ? new Response(pages[id]) : new Response("", { status: id === "026-1154" ? 403 : 404 }); // 403 = reserved, unpublished
    }) as typeof fetch;
    const items: IngestItem[] = [];
    const runCtx = { ...ctx, canadabuysMinValue: 0, grantsMinValue: 0, fetchImpl, progress: async () => {}, known: { newestId: "026-1152", oldestId: "025-1300", oldestDate: "2025-11-20" } } as IngestContext;
    for await (const i of eroApprovals.run(runCtx)) items.push(i);
    expect(rowOf(items).map((r) => [r.raw_entity_name, (r.raw as { kind: string }).kind])).toEqual([["Acme Coatings Inc.", "growth"]]);
    expect(requested[0]).toBe("026-1153");
    expect(requested).toHaveLength(3 + 15); // 1153 found, 1154 missing, 1155 found, then 15 misses in a row; backfill skipped (already reaches the cutoff)
  });
});

describe("new sources downstream", () => {
  const sig = (row: SignalRow, id = "x"): RecordSignal => ({ id, ...row }) as unknown as RecordSignal;
  it("score, count as physical activity and become public record sources", () => {
    const news = sig(rowOf(mapRelease(release(), ctx))[0]);
    expect(signalWeight(news as SignalForCandidate)).toEqual({ weight: 5, label: "Ontario announcement: new facility" });
    expect(isPhysical(news)).toBe(true);
    expect(familyOf(news)).toBe("news");
    expect(toRecordSource(news)).toMatchObject({ publisher: "Government of Ontario – Newsroom", url: "https://news.ontario.ca/en/release/1007999" });
    expect(recordExcerpt(news)).toContain("Amount announced ($): 44000000");

    const eca = sig(rowOf(mapNotice(parseNotice("026-1152", page({ title: "Acme Coatings Inc. - Environmental Compliance Approval (air)", type: "Environmental Compliance Approval (air)", details: "Replace a dust collector." })), ctx))[0]);
    expect(signalWeight(eca as SignalForCandidate)).toEqual({ weight: 2, label: "environmental approval: production change" });
    expect(familyOf(eca)).toBe("approval");
    expect(toRecordSource(eca)?.publisher).toBe("Environmental Registry of Ontario");
    expect(recordExcerpt(eca)).toContain("Posted: 2026-11-06 (proposal or decision notice");
  });
});

describe("Environmental Registry: broken pages", () => {
  it("skips a page that keeps returning 500 and carries on", async () => {
    const ok = page({ title: "Acme Coatings Inc. - Environmental Compliance Approval (air)", type: "Environmental Compliance Approval (air)", posted: "November 10, 2026", details: "Additional spray booth." });
    let calls844 = 0;
    const fetchImpl = (async (url: string) => {
      const id = url.split("/").pop()!;
      if (id === "026-1153") return new Response(ok);
      if (id === "026-1154") return (calls844++, new Response("", { status: 500 }));
      if (id === "026-1155") return new Response(ok.replace("Acme Coatings Inc.", "Beta Plastics Ltd."));
      return new Response("", { status: 404 });
    }) as typeof fetch;
    const items: IngestItem[] = [];
    const runCtx = { ...ctx, canadabuysMinValue: 0, grantsMinValue: 0, fetchImpl, progress: async () => {}, known: { newestId: "026-1152", oldestId: "025-1300", oldestDate: "2025-11-20" } } as IngestContext;
    for await (const i of eroApprovals.run(runCtx)) items.push(i);
    expect(rowOf(items).map((r) => r.raw_entity_name)).toEqual(["Acme Coatings Inc.", "Beta Plastics Ltd."]);
    expect(items).toContainEqual({ skip: "notice page error (HTTP 500)" });
    expect(calls844).toBe(2); // retried once
  }, 15_000);
});

describe("Environmental Registry: names and administrative notices", () => {
  it("keeps the legal name", () => {
    expect(legalName("Sofina Foods Inc. Aliments Sofina Inc.")).toBe("Sofina Foods Inc.");
    expect(legalName("St. Marys Cement Inc. (Canada) operating as CBM Ready Mix")).toBe("St. Marys Cement Inc. (Canada)");
    expect(legalName("Royal Automotive Group Ltd. operating as Rollstar Metal Forming")).toBe("Royal Automotive Group Ltd.");
    expect(legalName("MARTINREA AUTOMOTIVE INC.")).toBe("MARTINREA AUTOMOTIVE INC.");
    expect(legalName("Tempel Canada Company")).toBe("Tempel Canada Company");
    expect(legalName("Dana Canada Corporation/Corporation Dana Canada")).toBe("Dana Canada Corporation");
    expect(legalName("Lincoln Electric Company of Canada GP 2 Limited as general partner for and on behalf of Lincoln Electric Company of Canada LP")).toBe("Lincoln Electric Company of Canada LP");
    expect(legalName("Owens Corning Insulating Systems Canada GP Inc., as general partner for and on behalf of Owens Corning Insulating Systems Canada LP")).toBe("Owens Corning Insulating Systems Canada LP");
    expect(legalName("TransAlta Cogeneration Ltd. as general partner for and on behald of TransAlta Cogeneration, L.P.")).toBe("TransAlta Cogeneration, L.P.");
    expect(legalName("Suncor Energy Inc. and 1277136 Alberta Ltd. as general partners")).toBe("Suncor Energy Inc.");
    expect(legalName("Sky Energy (Power) Corporation and Tractebel Management Inc. as general partner for and on behalf of Tractebel Windsor Power L.P")).toBe("Tractebel Windsor Power L.P");
    expect(legalName("Johnson and Johnson Inc.")).toBe("Johnson and Johnson Inc.");
  });
  it("marks paperwork as administrative (weight 1, not physical) and keeps the posted name", () => {
    const n = parseNotice("026-0921", page({ title: "Sofina Foods Inc. Aliments Sofina Inc. - Environmental Compliance Approval (air)", type: "Environmental Compliance Approval (air)", details: "This proposal is for the renewal of Limited Operational Flexibility for the facility." }));
    const [r] = rowOf(mapNotice(n, ctx));
    expect(r).toMatchObject({ raw_entity_name: "Sofina Foods Inc.", entity_key: "sofina foods" });
    expect(r.raw).toMatchObject({ kind: "admin", name_as_posted: "Sofina Foods Inc. Aliments Sofina Inc." });
    const s = { id: "a", ...r } as unknown as RecordSignal;
    expect(signalWeight(s as SignalForCandidate)).toEqual({ weight: 1, label: "environmental approval: administrative" });
    expect(isPhysical(s)).toBe(false);
  });
  it("ignores the standard flexibility wording when classifying", () => {
    const boiler = "It permits modifications such as process changes, de-bottlenecking or addition of new equipment subject to limits on operational flexibility. The Limited Operational Flexibility conditions will expire 10 years from the date of the Approval.";
    const kindOf = (details: string) => {
      const n = parseNotice("026-0950", page({ title: "Acme Wire Inc. - Environmental Compliance Approval (air & noise)", type: "Environmental Compliance Approval (air & noise)", details }));
      return (rowOf(mapNotice(n, ctx))[0].raw as { kind: string }).kind;
    };
    expect(kindOf(`An amended Environmental Compliance Approval with Limited Operational was granted to Acme Wire Inc., operating a wire facility. ${boiler}`)).toBe("admin");
    expect(kindOf(`An amended Environmental Compliance Approval with Limited Operational Flexibility to add a new furnace was granted to Acme Wire Inc. ${boiler}`)).toBe("growth");
    expect(kindOf(`This approval is for the stack modification at the facility. ${boiler}`)).toBe("change");
  });
});
