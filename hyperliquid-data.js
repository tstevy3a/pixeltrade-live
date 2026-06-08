/* ===== Hyperliquid browser-side fetcher =====
   Mainnet: https://api.hyperliquid.xyz (public read-only, no auth needed)
   Portfolio: polls real wallet balance + positions every 10s
   Write ops (orders) go through MCP server on localhost — never from browser. */
(function(){
  const API_URL = 'https://api.hyperliquid.xyz';
  const WALLET  = '0xF7e687e0e4A250e4CDa493fD2C0606610eFe4073';
  const POLL_MS         = 5000;
  const POLL_CANDLE_MS  = 30000;
  const POLL_PORTFOLIO_MS = 10000;
  const DEFAULT_SYMBOLS = ['BTC', 'ETH', 'SOL'];

  let priceCache = {};
  let candleCache = {};
  let indicatorCache = {};
  let portfolioCache = {balance: 0, available: 0, positions: [], ts: 0};
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
    pollPortfolio();
    window.__hlTimer       = setInterval(pollMids, POLL_MS);
    window.__hlIndTimer    = setInterval(pollAllIndicators, POLL_CANDLE_MS);
    window.__hlPortTimer   = setInterval(pollPortfolio, POLL_PORTFOLIO_MS);
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
    if (agent === 'nova') {
      if (finalRating === 'OVERWEIGHT') finalRating = 'BUY';
      if (finalRating === 'UNDERWEIGHT') finalRating = 'SELL';
      if (confidence < 0.50) finalRating = 'HOLD';  // was 0.65
    } else if (agent === 'cipher') {
      if (ind.rsi != null && ind.rsi < 40 && finalRating === 'BUY') confidence = Math.min(0.95, confidence + 0.1);
      if (ind.rsi != null && ind.rsi > 60 && finalRating === 'SELL') confidence = Math.min(0.95, confidence + 0.1);
      if (ind.rsi != null && ind.rsi > 42 && ind.rsi < 58) finalRating = 'HOLD';  // was 35-65
    } else if (agent === 'volt') {
      if (ind.bollinger && ind.bollinger.bandwidth > 0.08) finalRating = 'HOLD';  // was 0.04
      confidence = Math.min(0.95, confidence + 0.05);
    } else if (agent === 'quasar') {
      if (Math.abs(ind.change_pct || 0) < 0.3) finalRating = 'HOLD';  // was 1.0
    } else if (agent === 'atlas') {
      if (ind.rsi != null && ind.rsi > 45 && ind.rsi < 55) finalRating = 'HOLD';  // was 40-60
      confidence = Math.max(0.5, confidence - 0.1);
    } else if (agent === 'onyx') {
      if (finalRating === 'SELL' || finalRating === 'UNDERWEIGHT') finalRating = 'HOLD';
      if (ind.rsi != null && ind.rsi > 65) finalRating = 'HOLD';  // was 50
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

  async function pollPortfolio() {
    const d = await postJson({type: 'clearinghouseState', user: WALLET});
    if (!d) return;
    const ms = d.marginSummary || {};
    portfolioCache = {
      balance:   parseFloat(ms.accountValue  || 0),
      available: parseFloat(ms.totalRawUsd   || 0),
      positions: (d.assetPositions || []).map(p => {
        const pos = p.position || {};
        return {
          coin:   pos.coin,
          size:   parseFloat(pos.szi || 0),
          entry:  parseFloat(pos.entryPx || 0),
          uPnl:   parseFloat(pos.unrealizedPnl || 0),
          liq:    parseFloat(pos.liquidationPx || 0),
        };
      }),
      ts: Date.now(),
    };
    emitUpdate();
  }

  function getPortfolio() { return portfolioCache; }

  window.Hyperliquid = {
    start, getPrices, getPrice, getIndicators, getIndicatorsSync, getIndicatorsAll,
    onUpdate, decideAction, getPortfolio,
    mode: 'mainnet',
    wallet: WALLET,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
