import { z } from "zod";

import { tradeModeSchema } from "./types.js";

const envSchema = z.object({
  PIXELTRADE_MODE: tradeModeSchema.default("SHADOW"),
  PIXELTRADE_GATEWAY_TOKEN: z.string().min(32).optional(),
  PIXELTRADE_ALLOWED_ORIGIN: z.string().url().default("https://tstevy3a.github.io"),
  PIXELTRADE_PORT: z.coerce.number().int().min(1024).max(65535).default(3456),
  AUTO_RUN_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  LIVE_TRADING_ACK: z.string().optional(),
  HYPERLIQUID_VIEW_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/)
    .default("0xF7e687e0e4A250e4CDa493fD2C0606610eFe4073"),
  HYPERLIQUID_ACCOUNT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  HYPERLIQUID_API_PRIVATE_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  DASHSCOPE_API_KEY: z.string().min(1).optional(),
  DASHSCOPE_BASE_URL: z.string().url().default("https://dashscope-intl.aliyuncs.com/compatible-mode/v1"),
  MINIMAX_API_KEY: z.string().min(1).optional(),
  MINIMAX_BASE_URL: z.string().url().default("https://api.minimax.io/anthropic"),
  MAX_ACCOUNT_EQUITY_USD: z.coerce.number().positive().max(10_000).default(100),
  RISK_PER_TRADE: z.coerce.number().positive().max(0.005).default(0.0025),
  MAX_DAILY_LOSS: z.coerce.number().positive().max(0.03).default(0.01),
  MAX_OPEN_POSITIONS: z.coerce.number().int().min(1).max(3).default(1),
  MAX_LEVERAGE: z.coerce.number().min(1).max(3).default(1),
  MAX_TRADES_PER_DAY: z.coerce.number().int().min(1).max(5).default(3),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const config = envSchema.parse(env);
  if (config.PIXELTRADE_MODE !== "SHADOW") {
    if (!config.PIXELTRADE_GATEWAY_TOKEN) throw new Error("GATEWAY_TOKEN_REQUIRED");
    if (!config.HYPERLIQUID_ACCOUNT_ADDRESS) throw new Error("ACCOUNT_ADDRESS_REQUIRED");
    if (!config.HYPERLIQUID_API_PRIVATE_KEY) throw new Error("EXECUTION_PRIVATE_KEY_REQUIRED");
  }
  if (config.PIXELTRADE_MODE === "LIVE_MICRO" && config.LIVE_TRADING_ACK !== "I_UNDERSTAND_REAL_MONEY") {
    throw new Error("LIVE_TRADING_ACK_REQUIRED");
  }
  return config;
}
