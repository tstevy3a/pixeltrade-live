import { randomBytes } from "node:crypto";

import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";

import type {
  EntryFill,
  ExecutionAdapter,
  PositionCheck,
  ProtectionReceipt,
} from "./execution.js";

function cloid(): `0x${string}` {
  return `0x${randomBytes(16).toString("hex")}`;
}

function price(value: number) {
  if (!Number.isFinite(value) || value <= 0) throw new Error("INVALID_ORDER_PRICE");
  return Number(value.toPrecision(5)).toString();
}

function size(value: number) {
  if (!Number.isFinite(value) || value <= 0) throw new Error("INVALID_ORDER_SIZE");
  return value.toString();
}

export class HyperliquidExecutor implements ExecutionAdapter {
  private readonly exchange: ExchangeClient;
  private readonly info: InfoClient;
  private readonly accountAddress: `0x${string}`;
  private readonly leverage: number;
  private readonly assets = new Map<string, number>();
  private readonly sizeDecimals = new Map<string, number>();

  constructor(args: {
    isTestnet: boolean;
    accountAddress: `0x${string}`;
    apiPrivateKey: `0x${string}`;
    leverage: number;
  }) {
    const transport = new HttpTransport({ isTestnet: args.isTestnet });
    this.exchange = new ExchangeClient({
      transport,
      wallet: privateKeyToAccount(args.apiPrivateKey),
    });
    this.info = new InfoClient({ transport });
    this.accountAddress = args.accountAddress;
    this.leverage = args.leverage;
  }

  private async asset(symbol: string) {
    const cached = this.assets.get(symbol);
    if (cached !== undefined) return cached;
    const meta = await this.info.meta();
    const index = meta.universe.findIndex((item) => item.name === symbol);
    if (index < 0) throw new Error("UNKNOWN_HYPERLIQUID_ASSET");
    const metadata = meta.universe[index];
    if (!metadata) throw new Error("UNKNOWN_HYPERLIQUID_ASSET");
    this.assets.set(symbol, index);
    this.sizeDecimals.set(symbol, metadata.szDecimals);
    return index;
  }

  private async roundedSize(symbol: string, value: number) {
    await this.asset(symbol);
    const decimals = this.sizeDecimals.get(symbol);
    if (decimals === undefined) throw new Error("ASSET_SIZE_DECIMALS_UNAVAILABLE");
    const factor = 10 ** decimals;
    return Math.floor((value + Number.EPSILON) * factor) / factor;
  }

  async revalidateMark(symbol: string) {
    const mids = await this.info.allMids();
    const mark = Number(mids[symbol]);
    if (!Number.isFinite(mark) || mark <= 0) throw new Error("FRESH_MARK_UNAVAILABLE");
    return mark;
  }

  async openLong(symbol: string, quantity: number, maximumPrice: number): Promise<EntryFill> {
    const asset = await this.asset(symbol);
    await this.exchange.updateLeverage({ asset, isCross: false, leverage: this.leverage });
    const clientOrderId = cloid();
    const response = await this.exchange.order({
      orders: [{
        a: asset,
        b: true,
        p: price(maximumPrice),
        s: size(quantity),
        r: false,
        t: { limit: { tif: "FrontendMarket" } },
        c: clientOrderId,
      }],
      grouping: "na",
    });
    const status = response.response.data.statuses[0];
    if (!status || typeof status === "string" || !("filled" in status)) {
      throw new Error("ENTRY_NOT_FILLED");
    }
    return {
      orderId: status.filled.cloid ?? String(status.filled.oid),
      fillPrice: Number(status.filled.avgPx),
      quantity: Number(status.filled.totalSz),
    };
  }

  async position(symbol: string): Promise<PositionCheck> {
    const state = await this.info.clearinghouseState({ user: this.accountAddress });
    const row = state.assetPositions.find((item) => item.position.coin === symbol)?.position;
    return {
      quantity: row ? Math.max(0, Number(row.szi)) : 0,
      liquidationPrice: row?.liquidationPx ? Number(row.liquidationPx) : null,
    };
  }

  async placeProtection(args: {
    symbol: string;
    quantity: number;
    stopPrice: number;
    takeProfit1: number;
    takeProfit2: number;
  }): Promise<ProtectionReceipt> {
    const asset = await this.asset(args.symbol);
    const stopId = cloid();
    const tp1Id = cloid();
    const tp2Id = cloid();
    const total = await this.roundedSize(args.symbol, args.quantity);
    const half = await this.roundedSize(args.symbol, total / 2);
    const remainder = await this.roundedSize(args.symbol, total - half);
    if (total <= 0) throw new Error("INVALID_PROTECTION_SIZE");
    const takeProfits = half > 0 && remainder > 0
      ? [
          {
            a: asset, b: false, p: price(args.takeProfit1 * 0.995), s: size(half), r: true,
            t: { trigger: { isMarket: true, triggerPx: price(args.takeProfit1), tpsl: "tp" as const } }, c: tp1Id,
          },
          {
            a: asset, b: false, p: price(args.takeProfit2 * 0.995), s: size(remainder), r: true,
            t: { trigger: { isMarket: true, triggerPx: price(args.takeProfit2), tpsl: "tp" as const } }, c: tp2Id,
          },
        ]
      : [{
          a: asset, b: false, p: price(args.takeProfit1 * 0.995), s: size(total), r: true,
          t: { trigger: { isMarket: true, triggerPx: price(args.takeProfit1), tpsl: "tp" as const } }, c: tp1Id,
        }];
    const response = await this.exchange.order({
      orders: [
        {
          a: asset, b: false, p: price(args.stopPrice * 0.97), s: size(total), r: true,
          t: { trigger: { isMarket: true, triggerPx: price(args.stopPrice), tpsl: "sl" } }, c: stopId,
        },
        ...takeProfits,
      ],
      grouping: "normalTpsl",
    });
    if (response.response.data.statuses.some((status) => (
      typeof status !== "string" && "error" in status
    ))) throw new Error("PROTECTIVE_ORDER_REJECTED");
    return {
      stopOrderId: stopId,
      takeProfitOrderIds: takeProfits.length === 2 ? [tp1Id, tp2Id] : [tp1Id],
    };
  }

  async emergencyClose(symbol: string, quantity: number) {
    const asset = await this.asset(symbol);
    const mark = await this.revalidateMark(symbol);
    await this.exchange.order({
      orders: [{
        a: asset,
        b: false,
        p: price(mark * 0.97),
        s: size(quantity),
        r: true,
        t: { limit: { tif: "FrontendMarket" } },
        c: cloid(),
      }],
      grouping: "na",
    });
  }

  async auditProtection(symbols: readonly string[]) {
    const [state, orders] = await Promise.all([
      this.info.clearinghouseState({ user: this.accountAddress }),
      this.info.frontendOpenOrders({ user: this.accountAddress }),
    ]);
    const reports: Array<Record<string, unknown>> = [];
    for (const symbol of symbols) {
      const row = state.assetPositions.find((item) => item.position.coin === symbol)?.position;
      const quantity = row ? Number(row.szi) : 0;
      if (!Number.isFinite(quantity) || quantity === 0) {
        reports.push({ symbol, status: "FLAT" });
        continue;
      }
      if (quantity < 0) {
        reports.push({ symbol, status: "UNMANAGED_SHORT_DETECTED" });
        continue;
      }
      const protective = orders.filter((order) => (
        order.coin === symbol && order.reduceOnly && order.isTrigger && order.side === "A"
      ));
      const hasStop = protective.some((order) => order.orderType.startsWith("Stop"));
      const hasTakeProfit = protective.some((order) => order.orderType.startsWith("Take Profit"));
      if (hasStop && hasTakeProfit) {
        reports.push({ symbol, status: "PROTECTED", protectiveOrders: protective.length });
        continue;
      }
      const asset = await this.asset(symbol);
      if (protective.length) {
        await this.exchange.cancel({
          cancels: protective.map((order) => ({ a: asset, o: order.oid })),
        }).catch(() => undefined);
      }
      await this.emergencyClose(symbol, quantity);
      reports.push({
        symbol,
        status: "EMERGENCY_CLOSE_SENT",
        reason: !hasStop ? "STOP_MISSING" : "TAKE_PROFIT_MISSING",
      });
    }
    return reports;
  }
}
