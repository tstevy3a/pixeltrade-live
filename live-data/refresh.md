# How to refresh PixelTrade indicators

The page at `http://localhost:8001` polls `live-data/indicators.json` every 15 seconds.
To populate it with real data, ask Hermes:

```
refresh pixeltrade indicators
```

Or for the full pre-market scan (9:00 EST Mon-Fri) that picks 10 tickers from
the morning's gainers / volume breakouts / Bollinger squeezes:

```
run the pixeltrade pre-market scan
```

## What happens behind the scenes

Hermes calls these MCP tools, then writes `live-data/indicators.json`:

**Pre-market scan** (09:00 EST):
- `mcp__tradingview__top_gainers` (NASDAQ, 1D)
- `mcp__tradingview__volume_breakout_scanner` (NASDAQ, 1D)
- `mcp__tradingview__bollinger_scan` (NASDAQ, 1D, bbw < 0.04)
- `mcp__tradingview__smart_volume_scanner` (NASDAQ, 1D)
- merge + dedupe + rank → top 10
- `mcp__tradingview__combined_analysis` on each of the 10

**Intraday refresh** (every 15 min, market hours):
- `mcp__tradingview__combined_analysis` on the 10 existing tickers

**EOD freeze** (16:30 EST):
- `mcp__tradingview__combined_analysis` on the 10 existing tickers
- marks `scan_type: "eod"`

## Manual one-off refresh

```bash
cd ~/Desktop/pixeltrade-live
# Open in editor and write JSON, or:
hermes chat -q "refresh pixeltrade indicators for AAPL, NVDA, TSLA, MSFT, GOOGL, AMZN, META, AMD, NFLX, SPY using combined_analysis, then write to ~/Desktop/pixeltrade-live/live-data/indicators.json"
```

## Cron schedule

3 jobs are configured (see Task 11 in `LIVE_DATA.md`):
- `pixeltrade-premarket-scan` — 09:00 EST, Mon-Fri
- `pixeltrade-intraday-refresh` — every 15 min, market hours, Mon-Fri
- `pixeltrade-eod-freeze` — 16:30 EST, Mon-Fri

## Cost budget

~26 MCP calls per trading day × ~4K tokens = ~104K tokens ≈ $0.30/day ≈ $9/month.
Market-hours only — 24/7 would be ~$36/month.
