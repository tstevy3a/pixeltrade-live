/* ===== Simulation: stations / work-zones, tickers, outcomes ===== */

// positions are % of the room; (x,y)=hotspot marker, (ax,ay)=where the agent stands.
// zone:true  => a "work zone" (teal ring + always-on nameplate).  tag => short zone label.
const STATIONS = [
  // ---- work zones ----
  { id:'market',    name:'Market Terminal', tag:'MARKET',    icon:'📈', kind:'analyze',  zone:true,  x:13, y:15, ax:13, ay:31, dur:[2.0,3.4] },
  { id:'plan',      name:'Strategy Board',  tag:'PLAN',      icon:'🧭', kind:'plan',     zone:true,  x:33, y:13, ax:33, ay:31, dur:[1.8,2.8] },
  { id:'wins',      name:'Win Wall',        tag:'REVIEW',    icon:'🏆', kind:'review',   zone:true,  x:46, y:14, ax:46, ay:31, dur:[1.8,3.0] },
  { id:'macro',     name:'Macro Watch',     tag:'MACRO',     icon:'🌆', kind:'analyze',  zone:true,  x:59, y:15, ax:59, ay:31, dur:[2.0,3.2] },
  { id:'ops',       name:'Ops Console',     tag:'OPS',       icon:'🛰️', kind:'ops',      zone:true,  x:84, y:19, ax:84, ay:31, dur:[1.8,3.0] },
  { id:'pod',       name:'R&D Pod',         tag:'R&D',       icon:'🧪', kind:'backtest', zone:true,  x:20, y:40, ax:27, ay:47, dur:[2.4,3.8] },
  { id:'deal',      name:'Deal Desk',       tag:'DEALS',     icon:'🤝', kind:'trade',    zone:true,  x:80, y:36, ax:81, ay:45, dur:[2.2,3.6] },
  { id:'analytics', name:'Analytics Bay',   tag:'ANALYTICS', icon:'📊', kind:'analyze',  zone:true,  x:31, y:64, ax:31, ay:74, dur:[2.0,3.4] },
  { id:'desk',      name:'Trading Desk',    tag:'TRADING',   icon:'💹', kind:'trade',    zone:true,  x:19, y:67, ax:19, ay:81, dur:[2.4,4.0] },
  { id:'signals',   name:'Signal Garden',   tag:'SIGNALS',   icon:'🌱', kind:'signals',  zone:true,  x:47, y:68, ax:47, ay:78, dur:[2.0,3.2] },
  { id:'library',   name:'The Library',     tag:'RESEARCH',  icon:'📚', kind:'research', zone:true,  x:74, y:74, ax:78, ay:86, dur:[2.2,3.6] },
  // ---- leisure (keeps the office feeling alive) ----
  { id:'coffee',    name:'Coffee Bar',      icon:'☕', kind:'rest',  zone:false, x:75, y:19, ax:73, ay:30, dur:[1.2,2.2] },
  { id:'lounge',    name:'The Lounge',      icon:'🛋️', kind:'rest',  zone:false, x:47, y:43, ax:47, ay:60, dur:[1.4,2.6] },
  { id:'pingpong',  name:'Break Room',      icon:'🏓', kind:'break', zone:false, x:77, y:60, ax:72, ay:70, dur:[1.6,2.8] },
];

const TICKERS = ['AAPL','MSFT','GOOG','AMZN','TSLA','NVDA','META','AMD','NFLX','SPY'];

const rnd  = (a,b)=> a + Math.random()*(b-a);
const irnd = (a,b)=> Math.floor(rnd(a,b+1));
const pick = arr => arr[Math.floor(Math.random()*arr.length)];

function fmtMoney(n){ return '$'+Math.round(n).toLocaleString('en-US'); }
function fmtSigned(n){ const s=n>=0?'+':'-'; return s+'$'+Math.abs(Math.round(n)).toLocaleString('en-US'); }
function fmtClock(mins){
  let h=Math.floor(mins/60), m=mins%60; const ap=h>=12?'PM':'AM';
  let hh=h%12; if(hh===0) hh=12;
  return `${hh}:${String(m).padStart(2,'0')} ${ap}`;
}

// what happens when the agent finishes working a station
function generateOutcome(st){
  // Prefer live tickers (from morning scan / intraday refresh) over the static TICKERS list.
  // Falls back to TICKERS when cache is empty so the page still works without refresh.
  const haveLive = typeof LiveData !== 'undefined' && LiveData.freshness && LiveData.getMeta().refreshed_at;
  const liveTickers = haveLive ? Object.keys(LiveData.getAll()) : [];
  const T = liveTickers.length ? pick(liveTickers) : pick(TICKERS);

  // Reason tag from morning scan — e.g. " (top gainer)" — makes agents feel context-aware.
  const reasonTag = (() => {
    if (!haveLive) return '';
    const reasons = (LiveData.get(T) || {}).picked_reasons || [];
    const r = reasons[0];
    if (!r) return '';
    return ' (' + r.replace(/_/g, ' ') + ')';
  })();

  // Live indicator line — used by ANALYZE/SIGNALS kinds
  const liveLine = (() => {
    if (!haveLive) return null;
    const d = LiveData.get(T);
    if (!d || d.rsi == null) return null;
    const arrow = d.change_pct >= 0 ? '🟢' : '🔴';
    const sign  = d.change_pct >= 0 ? '+' : '';
    return arrow + ' ' + T + ' @ $' + d.price.toFixed(2) +
           ' (' + sign + d.change_pct.toFixed(2) + '%) · RSI ' + d.rsi.toFixed(0) +
           ' · ' + d.recommendation;
  })();

  // === LEVEL 1: Indicator-aware trade outcomes ===
  // Win rate 45-75% derived from RSI / MACD / BB / recommendation.
  // P&L magnitude scaled by BB-width volatility.
  const indicatorTrade = (side) => {
    if (!haveLive) return null;
    const d = LiveData.get(T);
    if (!d || d.rsi == null) return null;

    // 1) Base win rate
    let winRate = 0.50;

    // 2) RSI zones (mean-reversion bias)
    if (d.rsi < 30) winRate += 0.20;             // oversold → likely bounce
    else if (d.rsi > 70) winRate -= 0.15;        // overbought → likely pullback

    // 3) MACD trend confirmation
    if (d.macd_signal === 'bullish' && d.change_pct > 0) winRate += 0.10;
    else if (d.macd_signal === 'bearish' && d.change_pct < 0) winRate += 0.10;
    else if (d.macd_signal === 'bullish' && d.change_pct < 0) winRate -= 0.05;
    else if (d.macd_signal === 'bearish' && d.change_pct > 0) winRate -= 0.05;

    // 4) Bollinger Band rating
    if (d.bb_rating > 0) winRate += 0.05;
    else if (d.bb_rating < 0) winRate -= 0.05;

    // 5) Recommendation from TradingView
    if (d.recommendation === 'STRONG_BUY') winRate += 0.05;
    else if (d.recommendation === 'STRONG_SELL') winRate -= 0.10;

    // Side bias: BUY performs better in bullish setups, SELL in bearish
    if (side === 'BUY' && d.change_pct < -3) winRate -= 0.10;   // catching falling knife
    if (side === 'SELL' && d.change_pct > 3) winRate -= 0.10;   // shorting into rally

    // Clamp to realistic range
    winRate = Math.max(0.45, Math.min(0.75, winRate));

    // 6) P&L magnitude: BB-width volatility scaling
    // Squeeze (|bb_rating| ≤ 1) → 0.5x–0.8x ; Normal → 1.0x ; Wide (±2/±3) → 1.5x–2.0x
    const vol = Math.abs(d.bb_rating || 0);
    const volMul = vol === 0 ? 0.6
                 : vol === 1 ? 0.85
                 : vol === 2 ? 1.4
                 :            2.0;  // vol === 3

    const win  = Math.random() < winRate;
    const sign2 = win ? 1 : -1;
    const baseMag = rnd(120, 640);  // base magnitude
    const delta = sign2 * baseMag * volMul;
    return { win, delta, winRate, volMul };
  };

  switch(st.kind){
    case 'trade': {
      const side = Math.random()<0.55 ? 'BUY':'SELL';
      const qty = irnd(20,300);
      const price = +(rnd(40,520)).toFixed(2);
      const ind = indicatorTrade(side);
      // If we have live data, use indicator-aware outcome; else fall back to random 66%
      const win = ind ? ind.win : (Math.random()<0.66);
      const delta = ind ? ind.delta : (win ? rnd(120,640) : -rnd(80,360));
      // Build bubble — show win rate if we have data
      const bubbleSuffix = ind ? ` (${Math.round(ind.winRate*100)}% wr)` : '';
      return {
        bubble:`${side==='BUY'?'Buying':'Selling'} ${T}${bubbleSuffix}…`,
        balanceDelta:delta, pnlDelta:delta, taskInc:1,
        trade:{ side, ticker:T, qty, price },
        notif:{ ic: delta>=0?'✅':'🔻',
          text:`${side} ${T} ×${qty} @ $${price} → ${fmtSigned(delta)}`,
          kind: delta>=0?'up':'down' },
      };
    }
    case 'analyze':  return liveLine
      ? { bubble: `Analyzing ${T}${reasonTag}…`, balanceDelta:0, pnlDelta:0, taskInc:1,
          notif:{ ic:'📊', text: liveLine, kind: (LiveData.get(T).change_pct>=0?'up':'down') } }
      : out('📊', `Momentum building on ${T}${reasonTag}`, st, 1, pick([`Scanning the tape`,`Charting ${T}`,`Hunting setups`,`Reading the order flow`]));
    case 'research': return out('📚', `Filed a research note on ${T}${reasonTag}`, st, 1, pick([`Reading ${T} filings`,`Studying earnings`,`Digging through 10-Ks`]));
    case 'backtest': { const x=+(rnd(0.4,4.2)).toFixed(1);
      return out('🧪', `Backtest beat SPY by ${x}% on ${T}${reasonTag}`, st, 1, pick([`Backtesting strategy`,`Reviewing the journal`,`Stress-testing risk`])); }
    case 'plan':     return out('🧭', pick([`Risk capped at 2% / trade`,`Confirmed the day's plan`,`Set stop-losses`]), st, 1, pick([`Reviewing the plan`,`Checking risk limits`,`Marking key levels`]));
    case 'ops':      return out('🛰️', pick([`Feeds synced · 12ms latency`,`Order book rebalanced`,`Risk engine all green`]), st, 1, pick([`Syncing data feeds`,`Rebalancing the book`,`Tuning the risk engine`]));
    case 'signals':  { const dir=Math.random()<.5?'LONG':'SHORT';
      return out('🌱', `New ${dir} signal on ${T}${reasonTag}`, st, 1, pick([`Cultivating signals`,`Watering the model`,`Pruning weak signals`])); }
    case 'review':   { const x=irnd(58,74);
      return out('🏆', `Win rate holding at ${x}%`, st, 1, pick([`Tallying the win wall`,`Grading yesterday's trades`,`Updating the scorecard`])); }
    case 'rest':     return out('☕', pick([`Focus recharged`,`Logged the morning recap`,`Patience — waiting for a setup`]), st, 0, pick([`Brewing coffee`,`Catching a breather`,`Letting a trade breathe`]));
    case 'break':    return out('🏓', pick([`Break — clearing the head`,`Staying sharp`]), st, 0, pick([`Quick ping-pong break`,`Stretching it out`]));
    default:         return out('•','Working',st,0,'Working');
  }
}
function out(ic, text, st, taskInc, bubble){
  return { bubble:bubble+'…', balanceDelta:0, pnlDelta:0, taskInc, notif:{ic,text,kind:'plain'} };
}

Object.assign(window, { STATIONS, TICKERS, generateOutcome, fmtMoney, fmtSigned, fmtClock, rnd, irnd, pick });
