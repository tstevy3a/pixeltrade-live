import { describe, expect, it, vi } from "vitest";

import { executeRiskDecision, type ExecutionAdapter } from "../server/execution.js";
import type { MarketSnapshot, RiskDecision } from "../server/types.js";

const snapshot = { symbol: "BTC" } as MarketSnapshot;
const decision = {
  verdict: "BUY", entryPrice: 100, stopPrice: 95, takeProfit1: 105,
  takeProfit2: 110, quantity: 1,
} as RiskDecision;

function adapter(overrides: Partial<ExecutionAdapter> = {}): ExecutionAdapter {
  return {
    revalidateMark: vi.fn(async () => 100),
    openLong: vi.fn(async () => ({ orderId: "entry", fillPrice: 100, quantity: 1 })),
    position: vi.fn(async () => ({ quantity: 1, liquidationPrice: 10 })),
    placeProtection: vi.fn(async () => ({ stopOrderId: "sl", takeProfitOrderIds: ["tp1", "tp2"] })),
    emergencyClose: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("protected execution orchestration", () => {
  it("never touches an adapter in shadow mode", async () => {
    expect(await executeRiskDecision("SHADOW", snapshot, decision)).toEqual({ status: "SHADOW_ONLY", mode: "SHADOW" });
  });

  it("opens first and requires protective orders", async () => {
    const service = adapter();
    expect((await executeRiskDecision("TESTNET", snapshot, decision, service)).status).toBe("FILLED_AND_PROTECTED");
    expect(service.placeProtection).toHaveBeenCalledOnce();
  });

  it("emergency-closes when protection cannot be installed", async () => {
    const service = adapter({ placeProtection: vi.fn(async () => { throw new Error("PROTECTION_FAILED"); }) });
    await expect(executeRiskDecision("LIVE_MICRO", snapshot, decision, service)).rejects.toThrow("PROTECTION_FAILED");
    expect(service.emergencyClose).toHaveBeenCalledOnce();
  });
});
