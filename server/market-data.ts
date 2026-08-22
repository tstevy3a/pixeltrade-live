import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";

import { saveRiskState, type DurableRiskState } from "./risk-state.js";
import { marketSnapshotSchema, type CryptoSymbol, type MarketSnapshot } from "./types.js";

type Candle = { t: number; T: number; o: string; h: string; l: string; c: string; v: string };

function number(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("INVALID_MARKET_NUMBER");
  return parsed;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function ema(values: number[], period: number) {
  if (values.length < period) throw new Error("INSUFFICIENT_EMA_HISTORY");
  const alpha = 2 / (period + 1);
  let current = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  const series = Array(period - 1).fill(current) as number[];
  series.push(current);
  for (const value of values.slice(period)) {
    current = value * alpha + current * (1 - alpha);
    series.push(current);
  }
  return series;
}

function rsi(values: number[], period = 14) {
  const changes = values.slice(1).map((value, index) => value - values[index]!);
  const recent = changes.slice(-period);
  const gain = recent.reduce((sum, value) => sum + Math.max(value, 0), 0) / period;
  const loss = recent.reduce((sum, value) => sum + Math.max(-value, 0), 0) / period;
  return loss === 0 ? 100 : 100 - (100 / (1 + gain / loss));
}

function trueRanges(candles: Candle[]) {
  return candles.slice(1).map((candle, index) => {
    const previousClose = number(candles[index]!.c);
    return Math.max(
      number(candle.h) - number(candle.l),
      Math.abs(number(candle.h) - previousClose),
      Math.abs(number(candle.l) - previousClose),
    );
  });
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function indicators(candles: Candle[], markPrice: number) {
  if (candles.length < 220) throw new Error("INSUFFICIENT_CLOSED_CANDLES");
  const closes = candles.map((candle) => number(candle.c));
  const volumes = candles.map((candle) => number(candle.v));
  const ema20Series = ema(closes, 20);
  const ema50Series = ema(closes, 50);
  const ema200Series = ema(closes, 200);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdSeries = closes.map((_, index) => (ema12[index] ?? ema12.at(-1)!) - (ema26[index] ?? ema26.at(-1)!));
  const signal = ema(macdSeries.slice(25), 9);
  const macdAligned = macdSeries.slice(-signal.length);
  const histograms = macdAligned.map((value, index) => value - signal[index]!);
  const ranges = trueRanges(candles);
  const atr = average(ranges.slice(-14));
  const atrPctHistory = ranges.slice(-100).map((range, index) => range / closes[closes.length - 100 + index]!);
  const last20 = closes.slice(-20);
  const middle = average(last20);
  const std = Math.sqrt(average(last20.map((value) => (value - middle) ** 2)));
  const lower = middle - 2 * std;
  const previous = candles.at(-2)!;
  const latest = candles.at(-1)!;
  const previousClose = number(previous.c);
  const latestClose = number(latest.c);
  const priorHigh = Math.max(...candles.slice(-21, -1).map((candle) => number(candle.h)));
  const volumeMedian = median(volumes.slice(-40, -1));
  const triggers: MarketSnapshot["indicators"]["triggers"] = [];
  if (previousClose <= ema20Series.at(-2)! && latestClose > ema20Series.at(-1)!) triggers.push("EMA_RECLAIM");
  if (latestClose > priorHigh && volumes.at(-1)! > volumeMedian * 1.2) triggers.push("RANGE_BREAKOUT");
  if (histograms.at(-2)! <= 0 && histograms.at(-1)! > 0) triggers.push("MACD_POSITIVE_FLIP");
  if (number(previous.l) < lower && latestClose > lower) triggers.push("LOWER_BAND_RECLAIM");
  if (number(previous.l) < number(candles.at(-3)!.l) && latestClose > previousClose) triggers.push("HIGHER_LOW_AFTER_WICK");
  return {
    rsi: rsi(closes),
    atr,
    medianAtrPct: median(atrPctHistory),
    bollingerBandwidth: (4 * std) / middle,
    ema20: ema20Series.at(-1)!,
    ema50: ema50Series.at(-1)!,
    ema200: ema200Series.at(-1)!,
    ema50Slope: ema50Series.at(-1)! - ema50Series.at(-5)!,
    macdHistogram: histograms.at(-1)!,
    previousMacdHistogram: histograms.at(-2)!,
    candleRangeAtr: (number(latest.h) - number(latest.l)) / atr,
    abnormalVolume: volumes.at(-1)! > volumeMedian * 2.5,
    dataStable: Math.abs(markPrice / latestClose - 1) < 0.05,
    triggers,
  };
}

export class HyperliquidMarketData {
  private readonly info: InfoClient;

  constructor(isTestnet: boolean) {
    this.info = new InfoClient({ transport: new HttpTransport({ isTestnet }) });
  }

  async portfolio(accountAddress: `0x${string}`, now = new Date()) {
    const [account, spot, mids] = await Promise.all([
      this.info.clearinghouseState({ user: accountAddress }),
      this.info.spotClearinghouseState({ user: accountAddress }),
      this.info.allMids(),
    ]);
    const positions = account.assetPositions
      .filter((row) => number(row.position.szi) !== 0)
      .map(({ position }) => ({
        coin: position.coin,
        size: number(position.szi),
        side: number(position.szi) > 0 ? "LONG" as const : "SHORT" as const,
        entryPrice: number(position.entryPx),
        markPrice: mids[position.coin] ? number(mids[position.coin]) : null,
        positionValue: number(position.positionValue),
        unrealizedPnl: number(position.unrealizedPnl),
        returnOnEquity: number(position.returnOnEquity),
        liquidationPrice: position.liquidationPx ? number(position.liquidationPx) : null,
        marginUsed: number(position.marginUsed),
        leverage: position.leverage.value,
        leverageType: position.leverage.type,
        fundingSinceOpen: number(position.cumFunding.sinceOpen),
      }));
    const spotBalances = spot.balances
      .filter((balance) => number(balance.total) !== 0 || number(balance.hold) !== 0)
      .map((balance) => ({
        coin: balance.coin,
        total: number(balance.total),
        hold: number(balance.hold),
        available: number(balance.total) - number(balance.hold),
        entryNotional: number(balance.entryNtl),
      }));
    return {
      status: "AVAILABLE" as const,
      observedAt: now.toISOString(),
      accountAddress,
      accountValue: number(account.marginSummary.accountValue),
      withdrawable: number(account.withdrawable),
      totalNotionalPosition: number(account.marginSummary.totalNtlPos),
      totalMarginUsed: number(account.marginSummary.totalMarginUsed),
      totalUnrealizedPnl: positions.reduce((sum, position) => sum + position.unrealizedPnl, 0),
      positions,
      spotBalances,
    };
  }

  async reconcileRiskState(
    accountAddress: `0x${string}`,
    state: DurableRiskState | null,
    now = new Date(),
  ) {
    if (!state) return null;
    const fills = await this.info.userFills({ user: accountAddress, aggregateByTime: true });
    const start = Date.parse(`${state.date}T00:00:00.000Z`);
    const today = fills.filter((fill) => fill.time >= start && fill.time <= now.getTime());
    const realizedPnl = today.reduce((total, fill) => (
      total + number(fill.closedPnl) - number(fill.fee)
    ), 0);
    const openingOrders = new Set(today
      .filter((fill) => fill.dir.toLowerCase().startsWith("open"))
      .map((fill) => String(fill.oid)));
    const next: DurableRiskState = {
      ...state,
      realizedPnl,
      trades: Math.max(state.trades, openingOrders.size),
      processedFillIds: today.map((fill) => `${fill.hash}:${fill.tid}`).slice(-5000),
      updatedAt: now.toISOString(),
    };
    await saveRiskState(next);
    return next;
  }

  async snapshot(
    symbol: CryptoSymbol,
    accountAddress: `0x${string}`,
    riskState: DurableRiskState | null,
    now = new Date(),
  ): Promise<MarketSnapshot> {
    const startTime = now.getTime() - 260 * 60 * 60 * 1000;
    const [metaAndContexts, rawCandles, account] = await Promise.all([
      this.info.metaAndAssetCtxs(),
      this.info.candleSnapshot({ coin: symbol, interval: "1h", startTime, endTime: now.getTime() }),
      this.info.clearinghouseState({ user: accountAddress }),
    ]);
    const [meta, contexts] = metaAndContexts;
    const assetIndex = meta.universe.findIndex((asset) => asset.name === symbol);
    const asset = meta.universe[assetIndex];
    const context = contexts[assetIndex];
    if (!asset || !context) throw new Error("ASSET_METADATA_MISSING");
    const candles = (rawCandles as Candle[]).filter((candle) => candle.T <= now.getTime());
    const markPrice = number(context.markPx);
    const impactBid = context.impactPxs ? number(context.impactPxs[0]) : markPrice;
    const impactAsk = context.impactPxs ? number(context.impactPxs[1]) : markPrice;
    const positions = account.assetPositions.filter((row) => number(row.position.szi) !== 0);
    const current = positions.find((row) => row.position.coin === symbol)?.position;
    return marketSnapshotSchema.parse({
      exchange: "HYPERLIQUID",
      symbol,
      timeframe: "1h",
      observedAt: now.toISOString(),
      markPrice,
      oraclePrice: number(context.oraclePx),
      equity: number(account.marginSummary.accountValue),
      availableEquity: number(account.withdrawable),
      dailyPnl: riskState?.realizedPnl ?? 0,
      startingEquity: riskState?.startingEquity ?? null,
      riskStateReady: Boolean(riskState),
      tradesToday: riskState?.trades ?? 0,
      openPositions: positions.length,
      leverage: current?.leverage.value ?? 1,
      liquidationPrice: current?.liquidationPx ? number(current.liquidationPx) : null,
      fundingRateHourly: number(context.funding),
      spreadBps: ((impactAsk - impactBid) / markPrice) * 10_000,
      minNotional: 10,
      sizeDecimals: asset.szDecimals,
      indicators: indicators(candles, markPrice),
    });
  }
}
