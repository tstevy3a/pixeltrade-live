import type {
  CommitteeResult,
  MarketSnapshot,
  RiskDecision,
  VolatilityRegime,
} from "./types.js";

export type RiskLimits = {
  riskPerTrade: number;
  maxDailyLoss: number;
  maxOpenPositions: number;
  maxTradesPerDay: number;
  maxLeverage: number;
  maxAccountEquityUsd: number;
  maximumQuoteAgeMs: number;
};

export const DEFAULT_RISK_LIMITS: RiskLimits = {
  riskPerTrade: 0.0025,
  maxDailyLoss: 0.01,
  maxOpenPositions: 1,
  maxTradesPerDay: 3,
  maxLeverage: 1,
  maxAccountEquityUsd: 100,
  maximumQuoteAgeMs: 30_000,
};

export function classifyVolatility(snapshot: MarketSnapshot): VolatilityRegime {
  const atrPct = snapshot.indicators.atr / snapshot.markPrice;
  const volRatio = atrPct / snapshot.indicators.medianAtrPct;
  if (
    !snapshot.indicators.dataStable
    || snapshot.indicators.abnormalVolume
    || snapshot.spreadBps > 30
    || snapshot.indicators.candleRangeAtr >= 3
    || Math.abs(snapshot.fundingRateHourly) >= 0.001
  ) return "SHOCK";
  if (volRatio >= 1.5 || snapshot.indicators.bollingerBandwidth >= 0.08) {
    return "EXPANSION";
  }
  if (volRatio <= 0.65 && snapshot.indicators.bollingerBandwidth <= 0.025) {
    return "COMPRESSED";
  }
  return "NORMAL";
}

function scores(snapshot: MarketSnapshot) {
  let bull = 0;
  let bear = 0;
  const { indicators } = snapshot;
  if (indicators.triggers.includes("EMA_RECLAIM")) bull += 0.75;
  if (indicators.triggers.includes("RANGE_BREAKOUT")) bull += 0.75;
  if (indicators.triggers.includes("MACD_POSITIVE_FLIP")) bull += 0.75;
  if (indicators.triggers.includes("LOWER_BAND_RECLAIM")) bull += 0.75;
  if (indicators.triggers.includes("HIGHER_LOW_AFTER_WICK")) bull += 0.75;
  if (snapshot.markPrice > indicators.ema50 && indicators.ema50Slope > 0) bull += 0.5;
  if (snapshot.fundingRateHourly < -0.0002 && indicators.triggers.length) bull += 0.25;

  if (indicators.rsi > 65) bear += 1.5;
  if (indicators.macdHistogram < indicators.previousMacdHistogram) bear += 0.5;
  if (snapshot.markPrice < indicators.ema50 && indicators.ema50Slope < 0) bear += 1;
  if (snapshot.markPrice < indicators.ema200) bear += 0.75;
  if (snapshot.fundingRateHourly > 0.0005) bear += 0.5;
  if (snapshot.indicators.bollingerBandwidth >= 0.08) bear += 0.5;
  return { bull, bear };
}

function emptyDecision(
  regime: VolatilityRegime,
  reasons: string[],
  bullScore = 0,
  bearScore = 0,
): RiskDecision {
  return {
    verdict: "HOLD",
    reasons,
    volatilityRegime: regime,
    bullScore,
    bearScore,
    triggerConfirmed: false,
    entryPrice: null,
    stopPrice: null,
    takeProfit1: null,
    takeProfit2: null,
    quantity: 0,
    maxLossUsd: 0,
    sizeMultiplier: 0,
  };
}

export function evaluateRisk(
  snapshot: MarketSnapshot,
  committee: CommitteeResult,
  limits: RiskLimits = DEFAULT_RISK_LIMITS,
  now = new Date(),
): RiskDecision {
  const regime = classifyVolatility(snapshot);
  const quoteAge = now.getTime() - new Date(snapshot.observedAt).getTime();
  if (!Number.isFinite(quoteAge) || quoteAge < -30_000 || quoteAge > limits.maximumQuoteAgeMs) {
    return emptyDecision(regime, ["STALE_OR_FUTURE_MARKET_DATA"]);
  }
  if (committee.symbol !== snapshot.symbol || committee.status !== "APPROVED") {
    return emptyDecision(regime, ["COMMITTEE_NOT_APPROVED"]);
  }
  if (!snapshot.riskStateReady) {
    return emptyDecision(regime, ["DURABLE_RISK_STATE_UNAVAILABLE"]);
  }
  if (committee.votes.some((vote) => (
    vote.status !== "AVAILABLE"
    || vote.verdict !== "BUY"
    || vote.confidence < 70
    || vote.criticalVeto
  ))) return emptyDecision(regime, ["COMMITTEE_UNANIMOUS_GATE_FAILED"]);
  if (snapshot.equity > limits.maxAccountEquityUsd) {
    return emptyDecision(regime, ["LIVE_MICRO_EQUITY_CAP_EXCEEDED"]);
  }
  if (snapshot.dailyPnl <= -((snapshot.startingEquity ?? snapshot.equity) * limits.maxDailyLoss)) {
    return emptyDecision(regime, ["MAX_DAILY_LOSS_REACHED"]);
  }
  if (snapshot.openPositions >= limits.maxOpenPositions) {
    return emptyDecision(regime, ["MAX_OPEN_POSITIONS_REACHED"]);
  }
  if (snapshot.tradesToday >= limits.maxTradesPerDay) {
    return emptyDecision(regime, ["MAX_TRADES_PER_DAY_REACHED"]);
  }
  if (snapshot.leverage > limits.maxLeverage) {
    return emptyDecision(regime, ["MAX_LEVERAGE_EXCEEDED"]);
  }
  if (regime === "SHOCK") return emptyDecision(regime, ["SHOCK_VOLATILITY"]);

  const { bull, bear } = scores(snapshot);
  const triggerConfirmed = snapshot.indicators.triggers.length > 0;
  if (!triggerConfirmed) return emptyDecision(regime, ["NO_CONFIRMED_TRIGGER"], bull, bear);
  if (bear >= 1.5 || snapshot.indicators.rsi > 65) {
    return emptyDecision(regime, ["BEAR_RISK_VETO"], bull, bear);
  }
  if (bull >= 1.5 && bear >= 1) {
    return emptyDecision(regime, ["CONFLICT_GUARD"], bull, bear);
  }

  const fullBuy = bull >= 2 && bull - bear >= 1.5 && bear < 1;
  const lightBuy = bull >= 1.5 && bull - bear >= 0.8 && bear < 1;
  if (!fullBuy && !lightBuy) {
    return emptyDecision(regime, ["INSUFFICIENT_EDGE_SCORE"], bull, bear);
  }

  const atrMultiple = regime === "EXPANSION" ? 2.5 : 2;
  const regimeMultiplier = regime === "NORMAL" ? 1 : regime === "COMPRESSED" ? 0.5 : 0.25;
  const verdictMultiplier = fullBuy ? 1 : 0.5;
  const sizeMultiplier = regimeMultiplier * verdictMultiplier;
  const entryPrice = snapshot.markPrice;
  const stopPrice = entryPrice - atrMultiple * snapshot.indicators.atr;
  const initialRisk = entryPrice - stopPrice;
  if (stopPrice <= 0 || initialRisk <= 0) {
    return emptyDecision(regime, ["INVALID_ATR_BRACKET"], bull, bear);
  }
  if (snapshot.liquidationPrice !== null && snapshot.liquidationPrice >= stopPrice) {
    return emptyDecision(regime, ["LIQUIDATION_CLOSER_THAN_STOP"], bull, bear);
  }
  const maxLossUsd = snapshot.equity * limits.riskPerTrade * sizeMultiplier;
  const rawQuantity = maxLossUsd / initialRisk;
  const factor = 10 ** snapshot.sizeDecimals;
  const quantity = Math.floor(rawQuantity * factor) / factor;
  if (quantity <= 0 || quantity * entryPrice < snapshot.minNotional) {
    return emptyDecision(regime, ["ORDER_BELOW_EXCHANGE_MINIMUM"], bull, bear);
  }
  return {
    verdict: fullBuy ? "BUY" : "LIGHT_BUY",
    reasons: ["COMMITTEE_AND_RISK_GATES_PASSED"],
    volatilityRegime: regime,
    bullScore: bull,
    bearScore: bear,
    triggerConfirmed,
    entryPrice,
    stopPrice,
    takeProfit1: entryPrice + 2 * snapshot.indicators.atr,
    takeProfit2: entryPrice + 3.5 * snapshot.indicators.atr,
    quantity,
    maxLossUsd,
    sizeMultiplier,
  };
}
