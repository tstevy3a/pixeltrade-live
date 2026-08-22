# PixelTrade Security Policy

## Trust boundary

The GitHub Pages frontend is public and read-only. It may show public market data and redacted gateway status, but it never receives an exchange private key, AI provider key, bearer token, full account state, or an order payload.

The gateway binds to `127.0.0.1`, accepts a single trusted web origin, limits request bodies, compares bearer tokens without timing leaks, and accepts only a BTC/ETH symbol. Side, size, leverage, stop and targets are computed server-side.

## Real-money barriers

- Default mode is `SHADOW`; automatic runs default to off.
- `TESTNET` and `LIVE_MICRO` require an execution API private key and authenticated gateway.
- `LIVE_MICRO` additionally requires `LIVE_TRADING_ACK=I_UNDERSTAND_REAL_MONEY`.
- Missing/stale/future/unstable data, missing AI output, invented evidence, disagreement, excessive volatility, daily-loss breach or absent durable state all fail closed to `HOLD`.
- A same-day risk baseline cannot be reset to hide losses or reset the trade counter.
- Every entry is followed by position confirmation and reduce-only protection. Failure to place protection triggers an emergency reduce-only close attempt.

## Secrets

Keep secrets only in a private deployment secret store or a local `.env` that is excluded from Git. Use a dedicated Hyperliquid API wallet with the minimum possible funded account. Never use a primary wallet private key and never paste secrets into issues, logs, screenshots or chat.

## Operational requirements

Before enabling live money, complete an extended testnet soak, verify trigger-order behavior, add external alerting/process supervision, and run a reconciliation watchdog for exchange positions and open protective orders. Trading software can fail and losses can exceed modeled values during gaps, outages, slippage or exchange failures.

## Incident response

If state, quotes, positions or protective orders disagree: disable the runner, inspect Hyperliquid directly, reduce or close exposure manually if appropriate, rotate the API wallet key, preserve `.pixeltrade/journal.jsonl`, and do not re-enable the service until reconciliation is complete.
