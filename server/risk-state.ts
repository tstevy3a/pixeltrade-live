import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { z } from "zod";

const stateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startingEquity: z.number().positive(),
  realizedPnl: z.number(),
  trades: z.number().int().nonnegative(),
  consecutiveLosses: z.number().int().nonnegative(),
  processedFillIds: z.array(z.string()).max(5000),
  updatedAt: z.string().datetime(),
});
export type DurableRiskState = z.infer<typeof stateSchema>;

const STATE_PATH = resolve(process.cwd(), ".pixeltrade/risk-state.json");

export async function readRiskState(
  now = new Date(),
  statePath = STATE_PATH,
): Promise<DurableRiskState | null> {
  try {
    const parsed = stateSchema.parse(JSON.parse(await readFile(statePath, "utf8")));
    return parsed.date === now.toISOString().slice(0, 10) ? parsed : null;
  } catch {
    return null;
  }
}

export async function establishRiskBaseline(
  equity: number,
  now = new Date(),
  statePath = STATE_PATH,
) {
  if (!Number.isFinite(equity) || equity <= 0) throw new Error("INVALID_BASELINE_EQUITY");
  // A same-day baseline is immutable: allowing a reset would erase the daily-loss
  // and trade-count circuit breakers after losses have already occurred.
  const existing = await readRiskState(now, statePath);
  if (existing) return existing;
  const state: DurableRiskState = {
    date: now.toISOString().slice(0, 10),
    startingEquity: equity,
    realizedPnl: 0,
    trades: 0,
    consecutiveLosses: 0,
    processedFillIds: [],
    updatedAt: now.toISOString(),
  };
  await saveRiskState(state, statePath);
  return state;
}

export async function saveRiskState(state: DurableRiskState, statePath = STATE_PATH) {
  const validated = stateSchema.parse(state);
  await mkdir(dirname(statePath), { recursive: true });
  const temporary = `${statePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(validated, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, statePath);
}

export async function recordExecutedEntry(state: DurableRiskState, now = new Date()) {
  const next = { ...state, trades: state.trades + 1, updatedAt: now.toISOString() };
  await saveRiskState(next);
  return next;
}
