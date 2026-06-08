# indicators.json schema

The cache file that PixelTrade reads every 15 seconds.

```json
{
  "version": 2,
  "refreshed_at": "2026-06-07T14:00:00Z",
  "source": "tradingview-mcp",
  "scan_meta": {
    "scan_date": "2026-06-07",
    "scan_type": "pre_market",
    "scanners_used": ["top_gainers", "volume_breakout_scanner", "bollinger_scan", "smart_volume_scanner"]
  },
  "tickers": {
    "NVDA": {
      "price": 482.30,
      "change_pct": 4.21,
      "recommendation": "STRONG_BUY",
      "buy_signals": 16,
      "sell_signals": 3,
      "rsi": 62.4,
      "macd_signal": "bullish",
      "bb_rating": 2,
      "picked_reasons": ["top_gainer", "volume_breakout"],
      "fetched_at": "2026-06-07T14:00:05Z"
    }
  }
}
```

## Field reference

| field | type | meaning |
|---|---|---|
| `version` | int | Schema version. Bump when changing shape. |
| `refreshed_at` | ISO 8601 or null | When the file was last written. Page uses this for the badge freshness. |
| `source` | string | Always `"tradingview-mcp"` for now. |
| `scan_meta.scan_date` | "YYYY-MM-DD" or null | Market date the scan was for. |
| `scan_meta.scan_type` | `"pre_market"` \| `"intraday"` \| `"eod"` \| null | What kind of refresh this was. |
| `scan_meta.scanners_used` | array of strings | Which MCP scanners contributed. Empty for pure intraday refresh. |
| `tickers.<TICKER>.price` | number | Last close price (USD). |
| `tickers.<TICKER>.change_pct` | number | % change vs previous close. Positive = green. |
| `tickers.<TICKER>.recommendation` | string | TradingView summary: `STRONG_BUY`, `BUY`, `NEUTRAL`, `SELL`, `STRONG_SELL`. |
| `tickers.<TICKER>.buy_signals` | int | Count of buy signals from TA. |
| `tickers.<TICKER>.sell_signals` | int | Count of sell signals from TA. |
| `tickers.<TICKER>.rsi` | number | 14-period RSI, 0-100. <30 oversold, >70 overbought. |
| `tickers.<TICKER>.macd_signal` | string | `"bullish"` \| `"bearish"` \| `"neutral"`. |
| `tickers.<TICKER>.bb_rating` | int | Bollinger Band rating, -3 to +3. |
| `tickers.<TICKER>.picked_reasons` | array | Tags from morning scan (e.g. `["top_gainer", "volume_breakout"]`). |
| `tickers.<TICKER>.fetched_at` | ISO 8601 | When this individual ticker was last refreshed. |

## Freshness rules (used by sidebar badge)

- `🟢 fresh` — `refreshed_at` < 5 minutes ago
- `🟡 aging` — 5-30 minutes ago
- `🔴 stale` — > 30 minutes ago, OR `null`
