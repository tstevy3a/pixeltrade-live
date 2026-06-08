# PixelTrade Live — Documentation

Real-time AI trading dashboard with live market data from TradingView MCP.

## What is this?

A pixel-art dashboard (`PixelTrade`) where 6 AI agents (Pip, Mara, Dex, Iris, Otis, Fern) work a virtual trading floor. Now wired to **real market data** — the simulation responds to actual market conditions via the TradingView MCP.

## Architecture

```
[Hermes Agent]                          [Browser]
  |                                       |
  |-- MCP scanners + combined_analysis    |
  |   (pre-market, every 15 min, EOD)     |
  v                                       |
write indicators.json  --HTTP poll 15s--> read live-data.js -> window.LiveData
                                                |
                                                v
                                          sim.jsx generateOutcome()
                                          views.jsx renders LivePanel
```

The MCP tools run inside Hermes, not in the browser. We use a **file-based cache** (`live-data/indicators.json`) that the browser polls every 15 seconds. The page gracefully degrades to the original random simulation if the cache is empty.

## Quickstart

### 1. Serve the page
```bash
cd ~/Desktop/pixeltrade-live
python3 -m http.server 8001
# Open http://localhost:8001
```

### 2. Refresh indicators (manual)
Ask Hermes: `refresh pixeltrade indicators`

Or run a one-off pre-market scan for the day's most interesting tickers:
```
run the pixeltrade pre-market scan
```

### 3. Watch the badge
- 🟢 **fresh** — < 5 min old
- 🟡 **aging** — 5-30 min
- 🔴 **stale** — > 30 min or null

## What changes vs. the original?

| | Original | PixelTrade Live |
|---|---|---|
| Ticker source | static `TICKERS` list | dynamic, picked each morning from MCP scanners |
| ANALYZE station | random text "Momentum building on AAPL" | real indicator: `🟢 AAPL @ $195.42 (+1.23%) · RSI 58 · BUY` |
| Sidebar status | (none) | `🟢 1m ago · pre_market` badge |
| Analysis view | workflow form | workflow form + **Live Indicators** table |
| Agent narrative | "Charting TSLA" | "Charting TSLA (top gainer)" |
| Picked reasons | hidden | shown as tags: `top gainer`, `volume breakout`, `bb squeeze`, `smart volume` |

## Files added / changed

**New:**
- `live-data.js` — client-side fetcher (15s polling, fallback)
- `live-data/indicators.json` — the cache
- `live-data/schema.md` — JSON schema
- `live-data/refresh.md` — how to refresh

**Modified:**
- `index.html` — load `live-data.js` before JSX modules
- `sim.jsx` — `generateOutcome()` uses live data + reason tags
- `sidebar.jsx` — `LiveBadge` component (fresh/aging/stale)
- `analysis.jsx` — `LivePanel` component (indicator table)
- `styles.css` — `.live-panel`, `.live-badge`, color classes

## Refresh flow (manual)

```
User → "refresh pixeltrade indicators" → Hermes
  → mcp__tradingview__combined_analysis (each ticker)
  → write live-data/indicators.json
  → page polls JSON, updates LivePanel within 15s
```

## Refresh flow (automated)

Three cron jobs handle the full day:

| Cron job | Schedule | What it does |
|---|---|---|
| `pixeltrade-premarket-scan` | 09:00 EST, Mon-Fri | Scanners → pick 10 → `combined_analysis` for each → write JSON with `scan_type: pre_market` |
| `pixeltrade-intraday-refresh` | every 15 min, 09:30-16:00 EST, Mon-Fri | Refresh the existing 10 tickers → `scan_type: intraday` |
| `pixeltrade-eod-freeze` | 16:30 EST, Mon-Fri | Final refresh → `scan_type: eod` |

## Cost

~26 MCP calls per trading day × ~4K tokens = ~104K tokens ≈ $0.30/day ≈ $9/month (market-hours only). 24/7 would be ~$36/month.

## Troubleshooting

**LiveBadge shows 🔴 No data**
- No `indicators.json` has been written yet
- Run a manual refresh: `hermes chat -q "refresh pixeltrade indicators"`

**LivePanel table is empty**
- Same as above

**Badge is 🔴 stale even after refresh**
- Check that the page can fetch the file: open browser DevTools Network tab
- If 404: check that `live-data/indicators.json` exists and is served by the http server
- If 200 but still 🔴: the `refreshed_at` timestamp in the file may be wrong

**Agents still using static TICKERS**
- Check that `live-data.js` loaded successfully (open DevTools console, no errors)
- Check that `indicators.json` has `"tickers": { ... }` with at least one entry

## License

MIT — same as the original `Wongsakorn-krub/ai-agents-pixels`.
