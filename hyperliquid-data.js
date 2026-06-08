/* ===== Hyperliquid browser-side fetcher =====
   Browser polls Hyperliquid testnet REST API directly (public, no auth).
   For trade execution, uses MCP server via Hermes (paper mode only).
   Caches prices in window.Hyperliquid; UI subscribes via onUpdate(). */
(function(){
  const API_URL = 'https://api.hyperliquid-testnet.xyz';
  const POLL_MS = 5000;   // 5s for prices
  const POLL_CANDLE_MS = 30000;  // 30s for candles
  const DEFAULT_SYMBOLS = ['BTC', 'ETH', 'SOL'];

  let priceCache = {};   // {symbol: {price, ts}}
  let candleCache = {};  // {symbol_interval: {candles, ts}}
  const subscribers = new Set();

  async function postJson(body) {
    try {
      const r = await fetch(API_URL + '/info', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error('http ' + r.status);
      return await r.json();
    } catch (e) {
      console.warn('[Hyperliquid] request failed:', e.message);
      return null;
    }
  }

  async function pollMids() {
    const data = await postJson({type: 'allMids'});
    if (data && typeof data === 'object') {
      const now = Date.now();
      for (const [sym, px] of Object.entries(data)) {
        if (DEFAULT_SYMBOLS.includes(sym) || /^#/.test(sym) === false) {
          // only track our 3 main symbols for the team view
          if (DEFAULT_SYMBOLS.includes(sym)) {
            priceCache[sym] = {price: parseFloat(px), ts: now};
          }
        }
      }
      // also store all if user wants to see
      Object.assign(priceCache, ...Object.entries(data).filter(([k]) => DEFAULT_SYMBOLS.includes(k)).map(([k, v]) => ({[k]: {price: parseFloat(v), ts: now}})));
      emitUpdate();
    }
  }

  async function pollCandles(symbol, interval = '1h') {
    const key = symbol + '_' + interval;
    const cached = candleCache[key];
    if (cached && Date.now() - cached.ts < POLL_CANDLE_MS) return cached.candles;
    const endTime = Date.now();
    const startTime = endTime - 200 * intervalMs(interval);
    const data = await postJson({
      type: 'candleSnapshot',
      req: {coin: symbol, interval, startTime, endTime}
    });
    if (data) {
      candleCache[key] = {candles: data, ts: Date.now()};
      return data;
    }
    return cached ? cached.candles : [];
  }

  function intervalMs(interval) {
    const unit = interval.slice(-1);
    const n = parseInt(interval, 10);
    if (unit === 'm') return n * 60 * 1000;
    if (unit === 'h') return n * 3600 * 1000;
    if (unit === 'd') return n * 86400 * 1000;
    return 3600 * 1000;
  }

  // === Local indicators (computed from candles) ===

  function rsi(candles, period = 14) {
    if (!candles || candles.length < period + 1) return null;
    const closes = candles.map(c => parseFloat(c.c));
    const deltas = [];
    for (let i = 1; i < closes.length; i++) deltas.push(closes[i] - closes[i-1]);
    let gains = 0, losses = 0;
    for (let i = 0; i < period; i++) {
      if (deltas[i] > 0) gains += deltas[i];
      else losses -= deltas[i];
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    for (let i = period; i < deltas.length; i++) {
      const d = deltas[i];
      avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
      avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    }
    if (avgLoss === 0) return 100;
    return 100 - (100 / (1 + avgGain / avgLoss));
  }

  function emaSeries(prices, period) {
    const k = 2 / (period + 1);
    const ema = [prices[0]];
    for (let i = 1; i < prices.length; i++) {
      ema.push(prices[i] * k + ema[i-1] * (1 - k));
    }
    return ema;
  }

  function macd(candles) {
    if (!candles || candles.length < 35) return null;
    const closes = candles.map(c => parseFloat(c.c));
    const e12 = emaSeries(closes, 12);
    const e26 = emaSeries(closes, 26);
    const macdLine = e12.map((v, i) => v - e26[i]);
    const signal = emaSeries(macdLine, 9);
    const last = macdLine[macdLine.length - 1];
    const lastSig = signal[signal.length - 1];
    return {macd: last, signal: lastSig, histogram: last - lastSig, trend: last > lastSig ? 'bullish' : 'bearish'};
  }

  function bollinger(candles, period = 20) {
    if (!candles || candles.length < period) return null;
    const closes = candles.slice(-period).map(c => parseFloat(c.c));
    const sma = closes.reduce((a, b) => a + b, 0) / period;
    const variance = closes.reduce((acc, v) => acc + (v - sma) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    const upper = sma + 2 * std;
    const lower = sma - 2 * std;
    const last = closes[closes.length - 1];
    let rating = 0;
    if (last > upper) rating = 2;
    else if (last > sma) rating = 1;
    else if (last < lower) rating = -2;
    else if (last < sma) rating = -1;
    return {upper, middle: sma, lower, bandwidth: (upper - lower) / sma, rating};
  }

  function atr(candles, period = 14) {
    if (!candles || candles.length < period + 1) return null;
    const trs = [];
    for (let i = 1; i < candles.length; i++) {
      const h = parseFloat(candles[i].h);
      const l = parseFloat(candles[i].l);
      const pc = parseFloat(candles[i-1].c);
      trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
  }

  function computeIndicators(candles) {
    if (!candles || !candles.length) return null;
    const closes = candles.map(c => parseFloat(c.c));
    const last = closes[closes.length - 1];
    const prev = closes[closes.length - 2] || last;
    return {
      price: last,
      change_pct: ((last - prev) / prev) * 100,
      rsi: rsi(candles),
      macd: macd(candles),
      bollinger: bollinger(candles),
      atr: atr(candles),
    };
  }

  function emitUpdate() {
    const snapshot = {prices: {...priceCache}};
    subscribers.forEach(cb => { try { cb(snapshot); } catch(e){console.warn(e);} });
  }

  // === Public API ===

  function start() {
    if (window.__hlTimer) return;
    pollMids();
    window.__hlTimer = setInterval(pollMids, POLL_MS);
  }

  function getPrices() {
    return {...priceCache};
  }

  function getPrice(symbol) {
    return priceCache[symbol] ? priceCache[symbol].price : null;
  }

  async function getIndicators(symbol, interval = '1h') {
    const candles = await pollCandles(symbol, interval);
    return computeIndicators(candles);
  }

  function onUpdate(cb) {
    subscribers.add(cb);
    cb({prices: getPrices()});
    return () => subscribers.delete(cb);
  }

  // === Hybrid decision logic (per-agent strategies) ===

  function decideAction(agent, symbol, ind) {
    if (!ind) return {action: 'skip', reason: 'no data'};
    const {price, rsi: r, macd: m, bollinger: bb, atr: a, change_pct} = ind;
    if (r == null || !m || !bb) return {action: 'skip', reason: 'insufficient data'};

    let action = 'skip', confidence = 0, reason = '';
    const trend = m.trend;

    if (agent === 'nova') {  // Momentum
      if (r > 60 && trend === 'bullish' && bb.rating > 0) {
        action = 'buy'; confidence = 0.85;
        reason = `Momentum: RSI ${r.toFixed(0)} + MACD bullish + BB positive`;
      } else if (r < 40 && trend === 'bearish' && bb.rating < 0) {
        action = 'sell'; confidence = 0.80;
        reason = `Momentum short: RSI ${r.toFixed(0)} + MACD bearish + BB negative`;
      } else if (r > 55 && trend === 'bullish') {
        action = 'buy'; confidence = 0.62;
        reason = `Mild bullish: RSI ${r.toFixed(0)}, MACD bullish`;
      } else if (r < 45 && trend === 'bearish') {
        action = 'sell'; confidence = 0.58;
        reason = `Mild bearish: RSI ${r.toFixed(0)}, MACD bearish`;
      }
    } else if (agent === 'cipher') {  // Mean reversion
      if (r < 30) { action = 'buy'; confidence = 0.78; reason = `Oversold bounce: RSI ${r.toFixed(0)}`; }
      else if (r > 70) { action = 'sell'; confidence = 0.75; reason = `Overbought fade: RSI ${r.toFixed(0)}`; }
      else if (r < 35) { action = 'buy'; confidence = 0.55; reason = `Near oversold: RSI ${r.toFixed(0)}`; }
      else if (r > 65) { action = 'sell'; confidence = 0.52; reason = `Near overbought: RSI ${r.toFixed(0)}`; }
    } else if (agent === 'volt') {  // Scalper (BB squeeze breakout)
      if (bb.bandwidth < 0.025 && trend === 'bullish' && price > bb.upper) {
        action = 'buy'; confidence = 0.72; reason = `BB squeeze breakout up: bw ${bb.bandwidth.toFixed(3)}`;
      } else if (bb.bandwidth < 0.025 && trend === 'bearish' && price < bb.lower) {
        action = 'sell'; confidence = 0.70; reason = `BB squeeze breakout down`;
      }
    } else if (agent === 'quasar') {  // Swing (EMA cross + HTF trend)
      if (r > 50 && r < 70 && trend === 'bullish' && change_pct > 1) {
        action = 'buy'; confidence = 0.65; reason = `Swing long: trend up, RSI ${r.toFixed(0)}`;
      } else if (r < 50 && r > 30 && trend === 'bearish' && change_pct < -1) {
        action = 'sell'; confidence = 0.62; reason = `Swing short: trend down, RSI ${r.toFixed(0)}`;
      }
    } else if (agent === 'atlas') {  // Hedge (delta-neutral, funding)
      if (r > 65) { action = 'sell'; confidence = 0.50; reason = `Funding hedge short: RSI ${r.toFixed(0)}`; }
      else if (r < 35) { action = 'buy'; confidence = 0.50; reason = `Funding hedge long: RSI ${r.toFixed(0)}`; }
    } else if (agent === 'onyx') {  // Spot bull (buy dips only)
      if (r < 40 && change_pct < -2) {
        action = 'buy'; confidence = 0.75; reason = `Buy dip: RSI ${r.toFixed(0)}, down ${change_pct.toFixed(1)}%`;
      } else if (r < 50 && trend === 'bullish' && change_pct < -1) {
        action = 'buy'; confidence = 0.55; reason = `Mild dip buy`;
      }
    }

    return {action, confidence, reason, price, rsi: r, atr: a, bb_bandwidth: bb.bandwidth, change_pct};
  }

  window.Hyperliquid = {
    start, getPrices, getPrice, getIndicators, onUpdate, decideAction,
    mode: 'testnet',
  };

  // Auto-start when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
