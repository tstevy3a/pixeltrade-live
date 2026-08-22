import { describe, expect, it } from "vitest";

import { evaluateRisk } from "../server/risk-engine.js";
import type { CommitteeResult, MarketSnapshot } from "../server/types.js";

const now = new Date("2026-08-22T10:00:00.000Z");
const snapshot: MarketSnapshot = {
  exchange: "HYPERLIQUID",
  symbol: "BTC",
  timeframe: "1h",
  observedAt: now.toISOString(),
  markPrice: 100_000,
  oraclePrice: 99_990,
  equity: 100,
  availableEquity: 100,
  dailyPnl: 0,
  startingEquity: 100,
  riskStateReady: true,
  tradesToday: 0,
  openPositions: 0,
  leverage: 1,
  liquidationPrice: 1_000,
  fundingRateHourly: 0,
  spreadBps: 2,
  minNotional: 10,
  sizeDecimals: 5,
  indicators: {
    rsi: 52,
    atr: 1_000,
    medianAtrPct: 0.01,
    bollingerBandwidth: 0.04,
    ema20: 99_500,
    ema50: 98_000,
    ema200: 90_000,
    ema50Slope: 50,
    macdHistogram: 2,
    previousMacdHistogram: -1,
    candleRangeAtr: 1,
    abnormalVolume: false,
    dataStable: true,
    triggers: ["EMA_RECLAIM", "MACD_POSITIVE_FLIP", "RANGE_BREAKOUT"],
  },
};
const committee: CommitteeResult = {
  status: "APPROVED",
  symbol: "BTC",
  completedAt: now.toISOString(),
  debateTriggered: false,
  evidenceIds: ["MARK_PRICE", "FUNDING", "TECHNICALS"],
  votes: ["qwen3.7-plus", "deepseek-v4-pro", "glm-5.2", "MiniMax-M3"].map((model) => ({
    model,
    role: "TEST",
    status: "AVAILABLE" as const,
    verdict: "BUY" as const,
    confidence: 80,
    thesis: "Evidence supports a controlled long.",
    risks: [],
    criticalVeto: false,
    evidenceIds: ["MARK_PRICE"],
  })),
};

describe("crypto risk engine", () => {
  it("permits only a bounded order after all gates pass", () => {
    const result = evaluateRisk(snapshot, committee, undefined, now);
    expect(result.verdict).toBe("BUY");
    expect(result.maxLossUsd).toBe(0.25);
    expect(result.quantity).toBeGreaterThan(0);
    expect(result.stopPrice).toBe(98_000);
  });

  it("fails closed when any committee model is unavailable", () => {
    const unavailable = structuredClone(committee);
    unavailable.votes[0]!.status = "UNAVAILABLE";
    expect(evaluateRisk(snapshot, unavailable, undefined, now).verdict).toBe("HOLD");
  });

  it("blocks a volatility shock", () => {
    const shock = structuredClone(snapshot);
    shock.indicators.candleRangeAtr = 3.5;
    expect(evaluateRisk(shock, committee, undefined, now).reasons).toContain("SHOCK_VOLATILITY");
  });

  it("treats abnormal volume as a shock instead of chasing it", () => {
    const shock = structuredClone(snapshot);
    shock.indicators.abnormalVolume = true;
    expect(evaluateRisk(shock, committee, undefined, now).reasons).toContain("SHOCK_VOLATILITY");
  });

  it("blocks stale prices and liquidation inside the stop", () => {
    const stale = { ...snapshot, observedAt: "2026-08-22T09:50:00.000Z" };
    expect(evaluateRisk(stale, committee, undefined, now).reasons).toContain("STALE_OR_FUTURE_MARKET_DATA");
    const unsafe = { ...snapshot, liquidationPrice: 99_000 };
    expect(evaluateRisk(unsafe, committee, undefined, now).reasons).toContain("LIQUIDATION_CLOSER_THAN_STOP");
  });

  it("anchors the daily loss breaker to starting equity", () => {
    const loss = { ...snapshot, equity: 100, startingEquity: 50, dailyPnl: -0.5 };
    expect(evaluateRisk(loss, committee, undefined, now).reasons).toContain("MAX_DAILY_LOSS_REACHED");
  });
});
