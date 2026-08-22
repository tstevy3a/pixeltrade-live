import { describe, expect, it } from "vitest";

import { loadConfig } from "../server/config.js";

describe("gateway configuration", () => {
  it("defaults to shadow and keeps automatic execution disabled", () => {
    const config = loadConfig({});
    expect(config.PIXELTRADE_MODE).toBe("SHADOW");
    expect(config.AUTO_RUN_ENABLED).toBe(false);
    expect(config.HYPERLIQUID_VIEW_ADDRESS).toBe("0xF7e687e0e4A250e4CDa493fD2C0606610eFe4073");
  });

  it("requires two explicit live-money barriers", () => {
    const base = {
      PIXELTRADE_MODE: "LIVE_MICRO",
      PIXELTRADE_GATEWAY_TOKEN: "x".repeat(32),
      HYPERLIQUID_ACCOUNT_ADDRESS: `0x${"1".repeat(40)}`,
      HYPERLIQUID_API_PRIVATE_KEY: `0x${"2".repeat(64)}`,
      MINIMAX_API_KEY: "minimax-test",
      PIXELTRADE_MODEL_PROXY_TOKEN: "p".repeat(32),
    };
    expect(() => loadConfig(base)).toThrow("LIVE_TRADING_ACK_REQUIRED");
    expect(loadConfig({ ...base, LIVE_TRADING_ACK: "I_UNDERSTAND_REAL_MONEY" }).PIXELTRADE_MODE).toBe("LIVE_MICRO");
  });

  it("will not arm testnet execution without its API private key", () => {
    expect(() => loadConfig({
      PIXELTRADE_MODE: "TESTNET",
      PIXELTRADE_GATEWAY_TOKEN: "x".repeat(32),
      HYPERLIQUID_ACCOUNT_ADDRESS: `0x${"1".repeat(40)}`,
    })).toThrow("EXECUTION_PRIVATE_KEY_REQUIRED");
  });
});
