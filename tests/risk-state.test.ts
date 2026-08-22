import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { establishRiskBaseline } from "../server/risk-state.js";

describe("durable daily risk state", () => {
  it("does not let a second baseline erase the same day's limits", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pixeltrade-risk-"));
    const path = join(directory, "risk-state.json");
    const now = new Date("2026-08-22T10:00:00.000Z");
    const first = await establishRiskBaseline(100, now, path);
    const second = await establishRiskBaseline(250, now, path);

    expect(first.startingEquity).toBe(100);
    expect(second.startingEquity).toBe(100);
    expect(second.updatedAt).toBe(first.updatedAt);
  });
});
