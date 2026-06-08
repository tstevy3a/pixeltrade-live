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
          balanceDelta: 0, pnlDelta: 0, taskInc: 1,
          notif: {
            ic: '⚖️',
            text: `Checked ${sym}: decided to HOLD (${dec.rating}) · RSI ${ind.rsi.toFixed(0)}`,
            kind: 'plain',
          },
        };
      }
      
      const side = dec.action === 'buy' ? 'BUY' : 'SELL';
      const winRate = dec.confidence;
      const win = Math.random() < winRate;
      
      const atrVal = dec.atr || (price * 0.01);
      const volatilityScaling = atrVal / (price * 0.01 || 1);
      const baseMag = rnd(50, 300);
      const delta = (win ? 1 : -1) * baseMag * Math.max(0.5, Math.min(2.0, volatilityScaling));
      
      return {
        bubble: `${side==='BUY'?'Long':'Short'} ${sym} (${dec.rating} ${Math.round(winRate*100)}% wr)…`,
        balanceDelta: delta, pnlDelta: delta, taskInc: 1,
        crypto_trade: {side, symbol: sym, qty, price},
        notif: {
          ic: delta >= 0 ? '📈' : '📉',
          text: `${side} ${sym} ×${qty} @ $${price.toFixed(2)} [${dec.rating}] → ${fmtSigned(delta)}`,
          kind: delta >= 0 ? 'up' : 'down',
        },
      };
    } else {
      // For sync use, just use current price
      const side = Math.random() < 0.55 ? 'BUY' : 'SELL';
      const win = Math.random() < 0.65;  // baseline until we have full decision
      const delta = win ? rnd(50, 300) : -rnd(40, 200);
      return {
        bubble: `${side==='BUY'?'Long':'Short'} ${sym}…`,
        balanceDelta: delta, pnlDelta: delta, taskInc: 1,
        crypto_trade: {side, symbol: sym, qty, price},
        notif: {
          ic: delta >= 0 ? '📈' : '📉',
          text: `${side} ${sym} ×${qty} @ $${price.toFixed(2)} → ${fmtSigned(delta)}`,
          kind: delta >= 0 ? 'up' : 'down',
        },
      };
    }
  }
  if (st.kind === 'crypto_funding') {
    const symbols = ['BTC','ETH','SOL'];
    const s = pick(symbols);
    return out('💸', `Funding rate check: ${s} ${rnd(-2, 5).toFixed(4)}%`, st, 1, pick([`Checking ${s} funding`, `Reading perp funding`, `Comparing funding rates`]));
  }
  if (st.kind === 'crypto_hedge') {
    return out('⚖️', `Hedge ratio recalc`, st, 1, pick([`Recalculating delta`, `Rebalancing hedge`, `Adjusting delta-neutral`]));
  }
  if (st.kind === 'crypto_backtest') {
    const x = +(rnd(0.4, 4.2)).toFixed(1);
    const s = pick(['BTC','ETH','SOL']);
    return out('🧪', `Backtest beat SPY by ${x}% on ${s}`, st, 1, pick([`Backtesting ${s}`, `Reviewing the journal`, `Stress-testing risk`]));
  }
  if (st.kind === 'crypto_spot') {
    const text = ind ? `Spot long: ${sym} @ $${price.toFixed(2)} (${dec ? dec.rating : 'HOLD'})` : `Spot long: ${sym}`;
    return out('🏦', text, st, 1, pick([`Spot desk review`, `Long-term HODL check`, `Cold storage verify`]));
  }
  if (st.kind === 'crypto_risk') {
    const text = ind && ind.atr ? `Risk check: ${sym} ATR $${ind.atr.toFixed(2)} · volatility ${ind.bollinger ? (ind.bollinger.bandwidth*100).toFixed(1)+'%' : 'normal'}` : `VaR 1.2% · position size OK`;
    return out('🛡️', text, st, 1, pick([`Risk check`, `Margin review`, `Leverage cap`]));
  }
  if (st.kind === 'crypto_chart') {
    const text = ind ? `Chart pattern on ${sym}: RSI is ${ind.rsi.toFixed(0)} (${ind.rsi < 35 ? 'oversold' : ind.rsi > 65 ? 'overbought' : 'neutral'})` : `Chart pattern on ${sym}`;
    return out('📊', text, st, 1, pick([`Reading ${sym} 4H`, `Scanning support/resistance`, `Marking levels`]));
  }
  if (st.kind === 'crypto_news') {
    return out('📰', pick([`${sym} headline scan`, `Macro news digest`, `Sentiment update`]), st, 1, pick([`Reading headlines`, `Scanning news wire`, `Sentiment check`]));
  }
  if (st.kind === 'rest') return out('🛋️', pick([`Focus recharged`, `Patience — waiting`]), st, 0, pick([`Brewing coffee`, `Catching a breather`]));
  if (st.kind === 'break') return out('🥤', pick([`Quick stretch`, `Hydration break`]), st, 0, pick([`Quick break`, `Stretching it out`]));
  return out('•','Working',st,0,'Working');
}

Object.assign(window, { CRYPTO_AGENTS, CRYPTO_STATIONS, CRYPTO_STARTS, generateCryptoOutcome });
