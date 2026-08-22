import type { MarketSnapshot, RiskDecision, TradeMode } from "./types.js";

export type EntryFill = { orderId: string; fillPrice: number; quantity: number };
export type PositionCheck = { quantity: number; liquidationPrice: number | null };
export type ProtectionReceipt = { stopOrderId: string; takeProfitOrderIds: string[] };

export interface ExecutionAdapter {
  revalidateMark(symbol: string): Promise<number>;
  openLong(symbol: string, quantity: number, maximumPrice: number): Promise<EntryFill>;
  position(symbol: string): Promise<PositionCheck>;
  placeProtection(args: {
    symbol: string;
    quantity: number;
    stopPrice: number;
    takeProfit1: number;
    takeProfit2: number;
  }): Promise<ProtectionReceipt>;
  emergencyClose(symbol: string, quantity: number): Promise<void>;
}

export type ExecutionReceipt = {
  status: "SHADOW_ONLY" | "FILLED_AND_PROTECTED";
  mode: TradeMode;
  entry?: EntryFill;
  protection?: ProtectionReceipt;
};

export async function executeRiskDecision(
  mode: TradeMode,
  snapshot: MarketSnapshot,
  decision: RiskDecision,
  adapter?: ExecutionAdapter,
): Promise<ExecutionReceipt> {
  if (!['BUY', 'LIGHT_BUY'].includes(decision.verdict)) throw new Error("RISK_DECISION_NOT_EXECUTABLE");
  if (!decision.entryPrice || !decision.stopPrice || !decision.takeProfit1 || !decision.takeProfit2 || decision.quantity <= 0) {
    throw new Error("INCOMPLETE_RISK_BRACKET");
  }
  if (mode === "SHADOW") return { status: "SHADOW_ONLY", mode };
  if (!adapter) throw new Error("EXECUTION_ADAPTER_REQUIRED");
  const freshMark = await adapter.revalidateMark(snapshot.symbol);
  if (Math.abs(freshMark / decision.entryPrice - 1) > 0.005) {
    throw new Error("ENTRY_PRICE_MOVED_BEYOND_LIMIT");
  }
  const entry = await adapter.openLong(snapshot.symbol, decision.quantity, freshMark * 1.005);
  try {
    const position = await adapter.position(snapshot.symbol);
    if (position.quantity <= 0) throw new Error("ENTRY_POSITION_NOT_CONFIRMED");
    if (position.liquidationPrice !== null && position.liquidationPrice >= decision.stopPrice) {
      throw new Error("POST_FILL_LIQUIDATION_INSIDE_STOP");
    }
    const protection = await adapter.placeProtection({
      symbol: snapshot.symbol,
      quantity: Math.min(entry.quantity, position.quantity),
      stopPrice: decision.stopPrice,
      takeProfit1: decision.takeProfit1,
      takeProfit2: decision.takeProfit2,
    });
    return { status: "FILLED_AND_PROTECTED", mode, entry, protection };
  } catch (error) {
    await adapter.emergencyClose(snapshot.symbol, entry.quantity).catch(() => undefined);
    throw error;
  }
}
