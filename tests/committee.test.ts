import { afterEach, describe, expect, it, vi } from "vitest";

import { runCryptoCommittee } from "../server/committee.js";
import type { MarketSnapshot } from "../server/types.js";

const snapshot = {
  exchange: "HYPERLIQUID",
  symbol: "BTC",
  timeframe: "1h",
  observedAt: new Date().toISOString(),
  markPrice: 100_000,
  oraclePrice: 100_000,
  equity: 50,
  availableEquity: 50,
  dailyPnl: 0,
  startingEquity: 50,
  riskStateReady: true,
  tradesToday: 0,
  openPositions: 0,
  leverage: 1,
  liquidationPrice: null,
  fundingRateHourly: 0,
  spreadBps: 2,
  minNotional: 10,
  sizeDecimals: 5,
  indicators: {
    rsi: 50,
    atr: 1_000,
    medianAtrPct: 0.01,
    bollingerBandwidth: 0.04,
    ema20: 100_000,
    ema50: 99_000,
    ema200: 90_000,
    ema50Slope: 1,
    macdHistogram: 1,
    previousMacdHistogram: -1,
    candleRangeAtr: 1,
    abnormalVolume: false,
    dataStable: true,
    triggers: ["MACD_POSITIVE_FLIP"],
  },
} satisfies MarketSnapshot;

const config = {
  dashscopeApiKey: "test",
  dashscopeBaseUrl: "https://dashscope.test/v1",
  minimaxApiKey: "test",
  minimaxBaseUrl: "https://minimax.test",
};

afterEach(() => vi.unstubAllGlobals());

describe("crypto committee", () => {
  it("approves only grounded unanimous votes", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const body = JSON.stringify({
        verdict: "BUY", confidence: 80, thesis: "Grounded", risks: [],
        criticalVeto: false, evidenceIds: ["MARK_ORACLE", "TECHNICALS"],
      });
      return String(url).includes("minimax")
        ? new Response(JSON.stringify({ content: [{ type: "text", text: body }] }))
        : new Response(JSON.stringify({ choices: [{ message: { content: body } }] }));
    }));
    const result = await runCryptoCommittee(snapshot, config);
    expect(result.status).toBe("APPROVED");
    expect(result.votes).toHaveLength(4);
  });

  it("fails closed when a model invents evidence", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const body = JSON.stringify({
        verdict: "BUY", confidence: 90, thesis: "Invented", risks: [],
        criticalVeto: false, evidenceIds: ["FAKE_NEWS"],
      });
      return String(url).includes("minimax")
        ? new Response(JSON.stringify({ content: [{ type: "text", text: body }] }))
        : new Response(JSON.stringify({ choices: [{ message: { content: body } }] }));
    }));
    expect((await runCryptoCommittee(snapshot, config)).status).toBe("UNAVAILABLE");
  });
});
