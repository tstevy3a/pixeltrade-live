import { z } from "zod";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseDotenv } from "dotenv";

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
  DASHSCOPE_BASE_URL: z.string().url().default("https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1"),
  PIXELTRADE_MODEL_PROXY_URL: z.string().url()
    .default("https://orbit-trading-cloud.vercel.app/api/pixeltrade-committee"),
  PIXELTRADE_MODEL_PROXY_TOKEN: z.string().min(32).optional(),
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

function keychain(service: string) {
  try {
    return execFileSync("/usr/bin/security", [
      "find-generic-password", "-a", "pixeltrade", "-s", service, "-w",
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined;
  } catch {
    return undefined;
  }
}

function secureRuntimeEnvironment(env: NodeJS.ProcessEnv) {
  const merged = { ...env };
  if (env.PIXELTRADE_IMPORT_SECURE_STORE !== "true") return merged;
  let legacy: Record<string, string> = {};
  try {
    legacy = parseDotenv(readFileSync(join(homedir(), ".hermes/.env")));
  } catch {
    // Missing legacy store is handled by the normal fail-closed validation below.
  }
  merged.HYPERLIQUID_API_PRIVATE_KEY ??= legacy.HYPERLIQUID_PRIVATE_KEY;
  merged.HYPERLIQUID_ACCOUNT_ADDRESS ??= legacy.HYPERLIQUID_WALLET;
  merged.MINIMAX_API_KEY ??= keychain("pixeltrade-minimax") ?? legacy.MINIMAX_API_KEY;
  merged.DASHSCOPE_API_KEY ??= keychain("pixeltrade-modelstudio");
  merged.PIXELTRADE_MODEL_PROXY_TOKEN ??= keychain("pixeltrade-model-proxy-token");
  merged.PIXELTRADE_GATEWAY_TOKEN ??= keychain("pixeltrade-gateway-token");
  return merged;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const config = envSchema.parse(secureRuntimeEnvironment(env));
  if (config.PIXELTRADE_MODE !== "SHADOW") {
    if (!config.PIXELTRADE_GATEWAY_TOKEN) throw new Error("GATEWAY_TOKEN_REQUIRED");
    if (!config.HYPERLIQUID_ACCOUNT_ADDRESS) throw new Error("ACCOUNT_ADDRESS_REQUIRED");
    if (!config.HYPERLIQUID_API_PRIVATE_KEY) throw new Error("EXECUTION_PRIVATE_KEY_REQUIRED");
    if (!config.MINIMAX_API_KEY) throw new Error("MINIMAX_API_KEY_REQUIRED");
    if (!config.DASHSCOPE_API_KEY && !config.PIXELTRADE_MODEL_PROXY_TOKEN) {
      throw new Error("MODELSTUDIO_ACCESS_REQUIRED");
    }
  }
  if (config.PIXELTRADE_MODE === "LIVE_MICRO" && config.LIVE_TRADING_ACK !== "I_UNDERSTAND_REAL_MONEY") {
    throw new Error("LIVE_TRADING_ACK_REQUIRED");
  }
  return config;
}
