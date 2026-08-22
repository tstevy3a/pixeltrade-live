import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";

import { cryptoCommitteeModels } from "./committee.js";
import { loadConfig } from "./config.js";
import { HyperliquidMarketData } from "./market-data.js";
import { readLastJournalSummary } from "./journal.js";
import { establishRiskBaseline, readRiskState } from "./risk-state.js";
import { engineBusy, runOnce } from "./service.js";
import { symbolSchema } from "./types.js";

const config = loadConfig();

function cors(response: ServerResponse, request: IncomingMessage) {
  if (request.headers.origin === config.PIXELTRADE_ALLOWED_ORIGIN) {
    response.setHeader("Access-Control-Allow-Origin", config.PIXELTRADE_ALLOWED_ORIGIN);
    response.setHeader("Vary", "Origin");
  }
}

function json(response: ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

function authorized(request: IncomingMessage) {
  const expected = config.PIXELTRADE_GATEWAY_TOKEN;
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function body(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    length += buffer.length;
    if (length > 10_000) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const server = createServer(async (request, response) => {
  cors(response, request);
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    });
    return response.end();
  }
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (request.method === "GET" && url.pathname === "/health") {
      return json(response, 200, {
        ok: true,
        service: "pixeltrade-private-gateway",
        mode: config.PIXELTRADE_MODE,
        liveArmed: config.PIXELTRADE_MODE === "LIVE_MICRO",
        engineBusy: engineBusy(),
      });
    }
    if (request.method === "GET" && url.pathname === "/api/status") {
      const state = await readRiskState();
      return json(response, 200, {
        mode: config.PIXELTRADE_MODE,
        liveArmed: config.PIXELTRADE_MODE === "LIVE_MICRO",
        engineBusy: engineBusy(),
        riskStateReady: Boolean(state),
        dailyPnl: state?.realizedPnl ?? null,
        tradesToday: state?.trades ?? null,
        models: cryptoCommitteeModels,
        lastEvent: await readLastJournalSummary(),
      });
    }
    if (request.method === "POST" && ["/api/run", "/api/admin/baseline"].includes(url.pathname)) {
      if (request.headers.origin && request.headers.origin !== config.PIXELTRADE_ALLOWED_ORIGIN) {
        return json(response, 403, { error: "UNTRUSTED_ORIGIN" });
      }
      if (!authorized(request)) return json(response, 401, { error: "UNAUTHORIZED" });
      if (!config.HYPERLIQUID_ACCOUNT_ADDRESS) return json(response, 409, { error: "ACCOUNT_ADDRESS_REQUIRED" });
      if (url.pathname === "/api/admin/baseline") {
        const market = new HyperliquidMarketData(config.PIXELTRADE_MODE === "TESTNET");
        const snapshot = await market.snapshot(
          "BTC",
          config.HYPERLIQUID_ACCOUNT_ADDRESS as `0x${string}`,
          null,
        );
        const state = await establishRiskBaseline(snapshot.equity);
        return json(response, 200, { ok: true, date: state.date, startingEquity: state.startingEquity });
      }
      const payload = await body(request) as { symbol?: unknown };
      const symbol = symbolSchema.parse(payload.symbol);
      return json(response, 200, await runOnce(config, symbol));
    }
    return json(response, 404, { error: "NOT_FOUND" });
  } catch (error) {
    const code = error instanceof Error
      ? error.message.replace(/[^A-Z0-9_]/gi, "_").slice(0, 120)
      : "REQUEST_FAILED";
    return json(response, code === "ENGINE_BUSY" ? 409 : 500, { error: code });
  }
});

server.listen(config.PIXELTRADE_PORT, "127.0.0.1", () => {
  process.stdout.write(`PixelTrade private gateway listening on 127.0.0.1:${config.PIXELTRADE_PORT} (${config.PIXELTRADE_MODE})\n`);
});

let lastAutomaticBucket = "";
async function automaticRun() {
  const now = new Date();
  if (now.getUTCMinutes() < 1 || now.getUTCMinutes() > 4) return;
  const bucket = now.toISOString().slice(0, 13);
  if (bucket === lastAutomaticBucket || engineBusy()) return;
  lastAutomaticBucket = bucket;
  for (const symbol of ["BTC", "ETH"] as const) {
    await runOnce(config, symbol).catch(() => undefined);
  }
}
if (config.AUTO_RUN_ENABLED) {
  const timer = setInterval(automaticRun, 30_000);
  timer.unref();
  void automaticRun();
}
