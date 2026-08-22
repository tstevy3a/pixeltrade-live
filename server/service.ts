import { runCryptoCommittee } from "./committee.js";
import type { AppConfig } from "./config.js";
import { executeRiskDecision } from "./execution.js";
import { HyperliquidExecutor } from "./hyperliquid-executor.js";
import { appendJournal } from "./journal.js";
import { HyperliquidMarketData } from "./market-data.js";
import { evaluateRisk } from "./risk-engine.js";
import { readRiskState, recordExecutedEntry } from "./risk-state.js";
import type { CryptoSymbol } from "./types.js";

let activeRun = false;

export async function runOnce(config: AppConfig, symbol: CryptoSymbol) {
  if (activeRun) throw new Error("ENGINE_BUSY");
  const selectedAddress = config.HYPERLIQUID_ACCOUNT_ADDRESS ?? (
    config.PIXELTRADE_MODE === "SHADOW" ? config.HYPERLIQUID_VIEW_ADDRESS : undefined
  );
  if (!selectedAddress) throw new Error("ACCOUNT_ADDRESS_REQUIRED");
  const accountAddress = selectedAddress as `0x${string}`;
  activeRun = true;
  const now = new Date();
  const isTestnet = config.PIXELTRADE_MODE === "TESTNET";
  const market = new HyperliquidMarketData(isTestnet);
  try {
    const storedRiskState = await readRiskState(now);
    const riskState = await market.reconcileRiskState(
      accountAddress,
      storedRiskState,
      now,
    );
    const snapshot = await market.snapshot(symbol, accountAddress, riskState, now);
    const committee = await runCryptoCommittee(snapshot, {
      dashscopeApiKey: config.DASHSCOPE_API_KEY,
      dashscopeBaseUrl: config.DASHSCOPE_BASE_URL,
      minimaxApiKey: config.MINIMAX_API_KEY,
      minimaxBaseUrl: config.MINIMAX_BASE_URL,
      modelProxyUrl: config.PIXELTRADE_MODEL_PROXY_URL,
      modelProxyToken: config.PIXELTRADE_MODEL_PROXY_TOKEN,
    });
    const risk = evaluateRisk(snapshot, committee, {
      riskPerTrade: config.RISK_PER_TRADE,
      maxDailyLoss: config.MAX_DAILY_LOSS,
      maxOpenPositions: config.MAX_OPEN_POSITIONS,
      maxTradesPerDay: config.MAX_TRADES_PER_DAY,
      maxLeverage: config.MAX_LEVERAGE,
      maxAccountEquityUsd: config.MAX_ACCOUNT_EQUITY_USD,
      maximumQuoteAgeMs: 30_000,
    }, now);
    await appendJournal({ type: "DECISION", mode: config.PIXELTRADE_MODE, symbol, snapshot, committee, risk });
    if (!['BUY', 'LIGHT_BUY'].includes(risk.verdict)) {
      return { snapshot, committee, risk, execution: null };
    }
    const adapter = config.PIXELTRADE_MODE === "SHADOW" ? undefined : new HyperliquidExecutor({
      isTestnet,
      accountAddress,
      apiPrivateKey: config.HYPERLIQUID_API_PRIVATE_KEY as `0x${string}`,
      leverage: config.MAX_LEVERAGE,
    });
    const execution = await executeRiskDecision(config.PIXELTRADE_MODE, snapshot, risk, adapter);
    if (execution.status === "FILLED_AND_PROTECTED" && riskState) {
      await recordExecutedEntry(riskState, new Date());
    }
    await appendJournal({ type: "EXECUTION", mode: config.PIXELTRADE_MODE, symbol, execution });
    return { snapshot, committee, risk, execution };
  } catch (error) {
    const code = error instanceof Error
      ? error.message.replace(/[^A-Z0-9_]/gi, "_").slice(0, 120)
      : "ENGINE_FAILED";
    await appendJournal({ type: "ERROR", mode: config.PIXELTRADE_MODE, symbol, code });
    throw new Error(code);
  } finally {
    activeRun = false;
  }
}

export function engineBusy() {
  return activeRun;
}
