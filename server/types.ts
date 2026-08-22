import { z } from "zod";

export const tradeModeSchema = z.enum(["SHADOW", "TESTNET", "LIVE_MICRO"]);
export type TradeMode = z.infer<typeof tradeModeSchema>;

export const symbolSchema = z.enum(["BTC", "ETH"]);
export type CryptoSymbol = z.infer<typeof symbolSchema>;

export const marketSnapshotSchema = z.object({
  exchange: z.literal("HYPERLIQUID"),
  symbol: symbolSchema,
  timeframe: z.enum(["1h", "4h"]),
  observedAt: z.string().datetime(),
  markPrice: z.number().positive(),
  oraclePrice: z.number().positive(),
  equity: z.number().positive(),
  availableEquity: z.number().nonnegative(),
  dailyPnl: z.number(),
  startingEquity: z.number().positive().nullable(),
  riskStateReady: z.boolean(),
  tradesToday: z.number().int().nonnegative(),
  openPositions: z.number().int().nonnegative(),
  leverage: z.number().min(1),
  liquidationPrice: z.number().positive().nullable(),
  fundingRateHourly: z.number(),
  spreadBps: z.number().nonnegative(),
  minNotional: z.number().positive(),
  sizeDecimals: z.number().int().min(0).max(8),
  indicators: z.object({
    rsi: z.number().min(0).max(100),
    atr: z.number().positive(),
    medianAtrPct: z.number().positive(),
    bollingerBandwidth: z.number().nonnegative(),
    ema20: z.number().positive(),
    ema50: z.number().positive(),
    ema200: z.number().positive(),
    ema50Slope: z.number(),
    macdHistogram: z.number(),
    previousMacdHistogram: z.number(),
    candleRangeAtr: z.number().nonnegative(),
    abnormalVolume: z.boolean(),
    dataStable: z.boolean(),
    triggers: z.array(z.enum([
      "EMA_RECLAIM",
      "RANGE_BREAKOUT",
      "MACD_POSITIVE_FLIP",
      "LOWER_BAND_RECLAIM",
      "HIGHER_LOW_AFTER_WICK",
    ])).max(5),
  }),
});
export type MarketSnapshot = z.infer<typeof marketSnapshotSchema>;

export const modelVoteSchema = z.object({
  model: z.string().min(1),
  role: z.string().min(1),
  status: z.enum(["AVAILABLE", "UNAVAILABLE"]),
  verdict: z.enum(["BUY", "HOLD", "VETO"]),
  confidence: z.number().int().min(0).max(100),
  thesis: z.string().max(600),
  risks: z.array(z.string().max(180)).max(6),
  criticalVeto: z.boolean(),
  evidenceIds: z.array(z.string().min(1).max(80)).max(12),
});
export type ModelVote = z.infer<typeof modelVoteSchema>;

export const committeeResultSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "UNAVAILABLE"]),
  symbol: symbolSchema,
  completedAt: z.string().datetime(),
  debateTriggered: z.boolean(),
  votes: z.array(modelVoteSchema).length(4),
  evidenceIds: z.array(z.string().min(1)).min(1),
});
export type CommitteeResult = z.infer<typeof committeeResultSchema>;

export type VolatilityRegime = "NORMAL" | "COMPRESSED" | "EXPANSION" | "SHOCK";

export type RiskDecision = {
  verdict: "BUY" | "LIGHT_BUY" | "HOLD" | "MANAGE_EXISTING_ONLY";
  reasons: string[];
  volatilityRegime: VolatilityRegime;
  bullScore: number;
  bearScore: number;
  triggerConfirmed: boolean;
  entryPrice: number | null;
  stopPrice: number | null;
  takeProfit1: number | null;
  takeProfit2: number | null;
  quantity: number;
  maxLossUsd: number;
  sizeMultiplier: number;
};
