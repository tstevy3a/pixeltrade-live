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
  let indicatorCache = {}; // {symbol: indicators}
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
    const snapshot = {prices: {...priceCache}, indicators: {...indicatorCache}};
    subscribers.forEach(cb => { try { cb(snapshot); } catch(e){console.warn(e);} });
  }

  async function pollAllIndicators() {
    for (const sym of DEFAULT_SYMBOLS) {
      try {
        const candles = await pollCandles(sym, '1h');
        if (candles && candles.length) {
          indicatorCache[sym] = computeIndicators(candles);
        }
      } catch(e) {
        console.warn('[Hyperliquid] failed to poll indicators for', sym, e);
      }
    }
    emitUpdate();
  }

  // === Public API ===

  function start() {
    if (window.__hlTimer) return;
    pollMids();
    pollAllIndicators();
    window.__hlTimer = setInterval(pollMids, POLL_MS);
    window.__hlIndTimer = setInterval(pollAllIndicators, POLL_CANDLE_MS);
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

  function getIndicatorsSync(symbol) {
    return indicatorCache[symbol] || null;
  }

  function getIndicatorsAll() {
    return {...indicatorCache};
  }

  function onUpdate(cb) {
    subscribers.add(cb);
    cb({prices: getPrices(), indicators: {...indicatorCache}});
    return () => subscribers.delete(cb);
  }

  // === Hybrid decision logic (uses TradingKnowledge) ===
  // Falls back to inline rules if TradingKnowledge not loaded
  function decideAction(agent, symbol, ind) {
    if (!ind) return {action: 'skip', reason: 'no data'};
    const TK = window.TradingKnowledge;

    // Build bull + bear cases using knowledge base
    let bull, bear;
    if (TK) {
      bull = TK.buildBullCase(ind, 'crypto');
      bear = TK.buildBearCase(ind, 'crypto');
    } else {
      // Fallback: minimal case scoring
      bull = {score: 0, reasons: [], side: 'bull'};
      bear = {score: 0, reasons: [], side: 'bear'};
    }

    let resolved;
    if (TK) {
      resolved = TK.resolveWithConflictGuard(bull, bear);
    }

    // Per-agent style modifies the base rating
    let finalRating = resolved ? resolved.rating : 'HOLD';
    let confidence = resolved ? Math.min(0.95, 0.5 + Math.abs(resolved.diff) * 0.3) : 0.5;
    let reasons = [
      ...(bull.reasons.length ? ['🟢 ' + bull.reasons.join('; ')] : []),
      ...(bear.reasons.length ? ['🔴 ' + bear.reasons.join('; ')] : [])
    ];

    // Per-agent style modifiers
    if (agent === 'nova') {  // Momentum
      // Nova goes with strong signals (BUY/SELL with high confidence)
      if (finalRating === 'OVERWEIGHT') finalRating = 'BUY';
      if (finalRating === 'UNDERWEIGHT') finalRating = 'SELL';
      // Nova trades only high-momentum setups
      if (confidence < 0.65) finalRating = 'HOLD';
    } else if (agent === 'cipher') {  // Mean reversion
      // Cipher does the OPPOSITE of momentum in extreme zones
      if (ind.rsi != null && ind.rsi < 30 && finalRating === 'BUY') confidence = Math.min(0.95, confidence + 0.1);
      if (ind.rsi != null && ind.rsi > 70 && finalRating === 'SELL') confidence = Math.min(0.95, confidence + 0.1);
      // Cipher only acts on strong extremes
      if (ind.rsi != null && ind.rsi > 35 && ind.rsi < 65) finalRating = 'HOLD';
    } else if (agent === 'volt') {  // Scalper
      // Volt wants squeeze breakouts only
      if (ind.bollinger && ind.bollinger.bandwidth > 0.04) finalRating = 'HOLD';
      // Volt uses tight take-profit
      confidence = Math.min(0.95, confidence + 0.05);
    } else if (agent === 'quasar') {  // Swing
      // Quasar needs broader timeframe signal — ignore tiny moves
      if (Math.abs(ind.change_pct || 0) < 1.0) finalRating = 'HOLD';
    } else if (agent === 'atlas') {  // Hedge
      // Atlas is delta-neutral — only act on extremes
      if (ind.rsi != null && ind.rsi > 40 && ind.rsi < 60) finalRating = 'HOLD';
      // Atlas is conservative confidence
      confidence = Math.max(0.5, confidence - 0.1);
    } else if (agent === 'onyx') {  // Spot bull
      // Onyx buys dips only — never shorts
      if (finalRating === 'SELL' || finalRating === 'UNDERWEIGHT') finalRating = 'HOLD';
      // Onyx needs oversold signal
      if (ind.rsi != null && ind.rsi > 50) finalRating = 'HOLD';
    }

    // Map rating to action
    let action = 'skip';
    if (finalRating === 'BUY') action = 'buy';
    else if (finalRating === 'OVERWEIGHT') action = 'buy';
    else if (finalRating === 'SELL') action = 'sell';
    else if (finalRating === 'UNDERWEIGHT') action = 'sell';
    else action = 'hold';

    // Format reason
    const reasonText = reasons.length
      ? `${finalRating} (${(confidence*100).toFixed(0)}% conf) — ${reasons.join(' | ')}`
      : `${finalRating} (${(confidence*100).toFixed(0)}% conf) — no clear signal`;

    return {
      action,
      rating: finalRating,
      confidence,
      reason: reasonText,
      bull_score: bull.score,
      bear_score: bear.score,
      price: ind.price,
      rsi: ind.rsi,
      atr: ind.atr,
      bb_bandwidth: ind.bollinger && ind.bollinger.bandwidth,
      change_pct: ind.change_pct,
    };
  }

  window.Hyperliquid = {
    start, getPrices, getPrice, getIndicators, getIndicatorsSync, getIndicatorsAll, onUpdate, decideAction,
    mode: 'testnet',
  };

  // Auto-start when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
