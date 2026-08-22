import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const JOURNAL_PATH = resolve(process.cwd(), ".pixeltrade/journal.jsonl");

export async function appendJournal(event: Record<string, unknown>) {
  await mkdir(dirname(JOURNAL_PATH), { recursive: true });
  await appendFile(
    JOURNAL_PATH,
    `${JSON.stringify({ recordedAt: new Date().toISOString(), ...event })}\n`,
    { mode: 0o600 },
  );
}

export async function readLastJournalSummary() {
  try {
    const lines = (await readFile(JOURNAL_PATH, "utf8")).trim().split("\n");
    const event = JSON.parse(lines.at(-1) ?? "null") as Record<string, unknown> | null;
    if (!event) return null;
    const committee = event.committee as Record<string, unknown> | undefined;
    const risk = event.risk as Record<string, unknown> | undefined;
    const execution = event.execution as Record<string, unknown> | undefined;
    return {
      recordedAt: event.recordedAt,
      type: event.type,
      symbol: event.symbol,
      mode: event.mode,
      committeeStatus: committee?.status ?? null,
      riskVerdict: risk?.verdict ?? null,
      riskReasons: risk?.reasons ?? [],
      volatilityRegime: risk?.volatilityRegime ?? null,
      executionStatus: execution?.status ?? null,
    };
  } catch {
    return null;
  }
}
