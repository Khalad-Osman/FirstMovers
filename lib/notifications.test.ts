import { describe, expect, it } from "vitest";
import { completedMessage } from "./notifications";

describe("completedMessage", () => {
  it("summarizes ratings, vacated space, unverified and failed companies", () => {
    const m = completedMessage(
      [
        { status: "brief", rating: "worth_monitoring", briefId: "a" },
        { status: "brief", rating: "no_meaningful_signal", briefId: "b" },
        { status: "brief", rating: "no_meaningful_signal", briefId: "c" },
        { status: "not_verified" },
        { status: "failed" },
      ],
      { scheduled: true, vacated: 1 },
    );
    expect(m.title).toBe("Scheduled discovery finished: 3 briefs");
    expect(m.body).toBe("1 Worth Monitoring, 2 No Meaningful Signal · 1 brief with possible vacated space · 1 not verified · 1 failed");
  });

  it("handles a run with nothing to research", () => {
    expect(completedMessage([], { scheduled: false, vacated: 0 })).toEqual({
      title: "Discovery finished: 0 briefs",
      body: "No companies were recommended for research.",
    });
  });
});
