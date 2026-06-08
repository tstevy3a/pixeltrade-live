/* ===== Crypto Team — 6 agents for paper trading on Hyperliquid testnet ===== */

// Crypto team sprites (reuse existing pixel-sprite maps but different palettes + tints)
const CRYPTO_AGENTS = [
  {id:'c1', name:'Nova',   role:'News Analyst',      desc:'Scans news & catalysts for market-moving events',       tint:'#4f8a4e',  map:TRADER_MAP,      palette:mkPalette({K:'#0e1a12', S:'#4f8a4e', s:'#2c5a32', T:'#f0d24a'})},
  {id:'c2', name:'Cipher', role:'Market Analyst',    desc:'Technical analysis: RSI, MACD, BB, EMA cross signals',  tint:'#9b6bff',  map:TRADER_MAP_LONG, palette:mkPalette({K:'#1a0e2a', S:'#9b6bff', s:'#6a3fa0', T:'#6fe08c'})},
  {id:'c3', name:'Volt',   role:'Bull Researcher',   desc:'Builds bull case — finds long setups & entry signals',   tint:'#e7b53c',  map:TRADER_MAP,      palette:mkPalette({K:'#1a1410', S:'#e7b53c', s:'#a37e22', T:'#3fa89a'})},
  {id:'c4', name:'Quasar', role:'Bear Researcher',   desc:'Builds bear case — spots shorts, resistance, risk',      tint:'#3fa89a',  map:TRADER_MAP_LONG, palette:mkPalette({K:'#0e1a18', S:'#3fa89a', s:'#2c7d72', T:'#e7b53c'})},
  {id:'c5', name:'Atlas',  role:'Risk Manager',      desc:'Aggressive/Conservative/Neutral debate — sets stops',    tint:'#6e7b8b',  map:TRADER_MAP,      palette:mkPalette({K:'#1a1a1a', S:'#6e7b8b', s:'#4f5864', T:'#6fe08c'})},
  {id:'c6', name:'Onyx',   role:'Portfolio Manager', desc:'Final decision — approves trades, manages live $55 book',tint:'#d98b3c',  map:TRADER_MAP_LONG, palette:mkPalette({K:'#0e0e0e', S:'#d98b3c', s:'#a06622', T:'#6fe08c'})},
];

// Crypto-themed work zones (positions in % of room — adjust layout)
const CRYPTO_STATIONS = [
  // Work zones
  {id:'btc',    name:'BTC Desk',         tag:'BTC',  icon:'₿',  kind:'crypto_trade',  zone:true,  x:14, y:14, ax:14, ay:31, dur:[2.0,3.4], sym:'BTC'},
  {id:'eth',    name:'ETH Desk',         tag:'ETH',  icon:'Ξ',  kind:'crypto_trade',  zone:true,  x:34, y:14, ax:34, ay:31, dur:[2.0,3.4], sym:'ETH'},
  {id:'sol',    name:'SOL Desk',         tag:'SOL',  icon:'◎',  kind:'crypto_trade',  zone:true,  x:54, y:14, ax:54, ay:31, dur:[2.0,3.4], sym:'SOL'},
  {id:'fund',   name:'Funding Board',    tag:'FUND', icon:'💸', kind:'crypto_funding',zone:true,  x:74, y:14, ax:74, ay:31, dur:[1.8,2.8]},
  {id:'hedge',  name:'Hedge Station',    tag:'HEDGE',icon:'⚖️', kind:'crypto_hedge',  zone:true,  x:20, y:50, ax:20, ay:62, dur:[2.0,3.2]},
  {id:'back',   name:'Backtest Vault',   tag:'BACK', icon:'🧪', kind:'crypto_backtest',zone:true, x:50, y:50, ax:50, ay:62, dur:[2.4,3.8]},
  {id:'spot',   name:'Spot Counter',     tag:'SPOT', icon:'🏦', kind:'crypto_spot',   zone:true,  x:80, y:50, ax:80, ay:62, dur:[2.0,3.4]},
  {id:'risk',   name:'Risk Watch',       tag:'RISK', icon:'🛡️', kind:'crypto_risk',   zone:true,  x:20, y:75, ax:20, ay:86, dur:[1.8,2.8]},
  {id:'chart',  name:'Chart Wall',       tag:'CHART',icon:'📊', kind:'crypto_chart',  zone:true,  x:50, y:75, ax:50, ay:86, dur:[2.0,3.2]},
  {id:'news',   name:'News Wire',        tag:'NEWS', icon:'📰', kind:'crypto_news',   zone:true,  x:80, y:75, ax:80, ay:86, dur:[1.6,2.6]},
  // Leisure
  {id:'lounge', name:'The Lounge',       icon:'🛋️', kind:'rest',  zone:false, x:14, y:60, ax:14, ay:73, dur:[1.4,2.6]},
  {id:'snack',  name:'Snack Bar',        icon:'🥤', kind:'break', zone:false, x:86, y:30, ax:86, ay:42, dur:[1.2,2.0]},
];

// Crypto team positions on the floor
const CRYPTO_STARTS = [
  {x:42,y:58},{x:52,y:62},{x:46,y:66},{x:70,y:64},{x:30,y:70},{x:58,y:52},
];

// === Crypto outcome generator ===
function generateCryptoOutcome(st, agent) {
  // Pick the symbol this station is tracking
  const sym = st.sym || pick(['BTC','ETH','SOL']);
  const price = window.Hyperliquid ? (window.Hyperliquid.getPrice(sym) || 0) : 0;
  const ind = window.Hyperliquid ? window.Hyperliquid.getIndicatorsSync(sym) : null;
  const dec = (window.Hyperliquid && agent && ind) ? window.Hyperliquid.decideAction(agent.name.toLowerCase(), sym, ind) : null;

  // Build outcome based on station kind
  if (st.kind === 'crypto_trade') {
    const qty = sym === 'BTC' ? 0.01 : sym === 'ETH' ? 0.1 : 0.5;
    if (ind && dec) {
      if (dec.action === 'hold' || dec.action === 'skip') {
        return {
          bubble: `Hold ${sym}…`,
          taskInc: 1,
          notif: { ic: '⚖️', text: `${sym} @ $${price.toFixed(0)} — HOLD (${dec.rating}) · RSI ${ind.rsi.toFixed(0)} · ${dec.reason}`, kind: 'plain' },
        };
      }
      const side = dec.action === 'buy' ? 'BUY' : 'SELL';
      return {
        bubble: `${side==='BUY'?'Long':'Short'} ${sym} [${dec.rating}]…`,
        taskInc: 1,
        crypto_trade: {side, symbol: sym, qty, price},
        notif: {
          ic: side==='BUY' ? '📈' : '📉',
          text: `${side} ${sym} ×${qty} @ $${price.toFixed(0)} [${dec.rating} ${Math.round(dec.confidence*100)}%] · ${dec.reason}`,
          kind: side==='BUY' ? 'up' : 'down',
        },
      };
    }
    // no indicators yet — just observe
    return {
      bubble: `Watching ${sym}…`,
      taskInc: 1,
      notif: { ic: '👁️', text: `${sym} @ $${price.toFixed(0)} — waiting for signal`, kind: 'plain' },
    };
  }
  if (st.kind === 'crypto_funding') {
    const s = pick(['BTC','ETH','SOL']);
    const rate = rnd(-0.05, 0.12).toFixed(4);
    const bias = parseFloat(rate) > 0 ? 'longs paying shorts' : 'shorts paying longs';
    return out('💸', `${s} funding rate ${rate}% (${bias})`, st, 1, `Checking ${s} perp funding`);
  }
  if (st.kind === 'crypto_hedge') {
    const s = pick(['BTC','ETH']);
    const ratio = rnd(0.3, 0.8).toFixed(2);
    return out('⚖️', `Delta-neutral hedge on ${s}: ratio ${ratio} · exposure balanced`, st, 1, `Rebalancing ${s} hedge`);
  }
  if (st.kind === 'crypto_backtest') {
    const s = pick(['BTC','ETH','SOL']);
    const strat = pick(['RSI mean-reversion','EMA cross','BB squeeze','funding arb']);
    const wr = rnd(48, 72).toFixed(0);
    return out('🧪', `${strat} on ${s}: ${wr}% win rate over 90d`, st, 1, `Backtesting ${strat} on ${s}`);
  }
  if (st.kind === 'crypto_spot') {
    const text = ind ? `Bull case on ${sym} @ $${price.toFixed(0)}: ${dec ? dec.rating : 'accumulate'} · RSI ${ind.rsi.toFixed(0)}` : `Building bull case for ${sym}`;
    return out('🟢', text, st, 1, `Bull research: ${sym}`);
  }
  if (st.kind === 'crypto_risk') {
    const text = ind && ind.atr
      ? `Risk debate on ${sym}: ATR $${ind.atr.toFixed(0)} · stop at ${(price - 2*ind.atr).toFixed(0)} · max size ${((55*0.1)/(2*ind.atr)).toFixed(4)} ${sym}`
      : `Portfolio risk check: leverage 2x · max loss $5.58/trade`;
    return out('🛡️', text, st, 1, `Risk debate: ${sym} position sizing`);
  }
  if (st.kind === 'crypto_chart') {
    const rsiLabel = ind ? (ind.rsi < 35 ? 'oversold — watching for reversal' : ind.rsi > 65 ? 'overbought — watching for pullback' : 'neutral zone') : 'scanning levels';
    const text = ind ? `${sym} chart: RSI ${ind.rsi.toFixed(0)} (${rsiLabel}) · ${ind.macd?.trend || 'MACD'} signal · MACD ${ind.macd?.trend || '—'}` : `Reading ${sym} chart`;
    return out('📊', text, st, 1, `Technical scan: ${sym} 4H`);
  }
  if (st.kind === 'crypto_news') {
    const headlines = [
      `${sym} whale wallet moved $${rnd(1,50).toFixed(0)}M on-chain — monitoring`,
      `Macro update: Fed minutes neutral · ${sym} holding key level`,
      `${sym} options OI up ${rnd(5,25).toFixed(0)}% · sentiment ${pick(['bullish','bearish','mixed'])}`,
      `Funding sentiment for ${sym}: ${pick(['greed index 72','fear index 38','neutral 51'])}`,
    ];
    return out('📰', pick(headlines), st, 1, `News scan: ${sym} catalysts`);
  }
  if (st.kind === 'rest') return out('🛋️', pick([`Focus recharged`, `Patience — waiting`]), st, 0, pick([`Brewing coffee`, `Catching a breather`]));
  if (st.kind === 'break') return out('🥤', pick([`Quick stretch`, `Hydration break`]), st, 0, pick([`Quick break`, `Stretching it out`]));
  return out('•','Working',st,0,'Working');
}

Object.assign(window, { CRYPTO_AGENTS, CRYPTO_STATIONS, CRYPTO_STARTS, generateCryptoOutcome });
