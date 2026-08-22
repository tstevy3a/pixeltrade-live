/* ===== Sidebar (taskbar): brand, nav, live stats, notifications ===== */

function LiveBadge(){
  const [meta, setMeta] = React.useState(window.LiveData ? window.LiveData.getMeta() : { refreshed_at: null });
  const [_, setTick] = React.useState(0);

  React.useEffect(()=>{
    if (!window.LiveData) return;
    // re-render every 30s to update age display
    const i = setInterval(()=> setTick(t=>t+1), 30000);
    return ()=> clearInterval(i);
  }, []);

  if (!window.LiveData) return <span className="live-badge stale">🔴 offline</span>;
  if (!meta.refreshed_at) {
    return (
      <span className="live-badge stale" title="No data yet — ask Hermes: refresh pixeltrade indicators">
        🔴 No data
      </span>
    );
  }
  const ageMin = (Date.now() - Date.parse(meta.refreshed_at)) / 60000;
  if (!isFinite(ageMin)) return <span className="live-badge stale">🔴 stale</span>;
  const cls = ageMin < 5 ? 'fresh' : ageMin < 30 ? 'aging' : 'stale';
  const ic  = ageMin < 5 ? '🟢' : ageMin < 30 ? '🟡' : '🔴';
  const scanType = (meta.scan_meta && meta.scan_meta.scan_type) ? ' · ' + meta.scan_meta.scan_type : '';
  return <span className={'live-badge '+cls} title={'Last refresh: ' + meta.refreshed_at}>{ic} {Math.round(ageMin)}m ago{scanType}</span>;
}

function Spark({data}){
  const ref = React.useRef(null);
  React.useEffect(()=>{
    const cv = ref.current; if(!cv) return;
    const ctx = cv.getContext('2d');
    const W=cv.width, H=cv.height;
    ctx.clearRect(0,0,W,H);
    // dotted baseline grid
    ctx.fillStyle='rgba(63,138,89,.25)';
    for(let y=10;y<H;y+=12) for(let x=0;x<W;x+=5) ctx.fillRect(x,y,2,1);
    const pts = data.length>1 ? data : [0,0];
    let mn=Math.min(...pts), mx=Math.max(...pts); if(mx===mn){mx+=1;mn-=1;}
    const pad=6;
    const X=i=> (i/(pts.length-1))*(W-pad*2)+pad;
    const Y=v=> H-pad - ((v-mn)/(mx-mn))*(H-pad*2);
    // area
    ctx.beginPath(); ctx.moveTo(X(0),H);
    pts.forEach((v,i)=>ctx.lineTo(X(i),Y(v)));
    ctx.lineTo(X(pts.length-1),H); ctx.closePath();
    ctx.fillStyle='rgba(111,224,140,.16)'; ctx.fill();
    // line
    ctx.beginPath(); pts.forEach((v,i)=> i?ctx.lineTo(X(i),Y(v)):ctx.moveTo(X(i),Y(v)));
    ctx.strokeStyle='#6fe08c'; ctx.lineWidth=2; ctx.lineJoin='round'; ctx.stroke();
    // head dot
    const lx=X(pts.length-1), ly=Y(pts[pts.length-1]);
    ctx.fillStyle='#d7ffe2'; ctx.fillRect(lx-2,ly-2,4,4);
  },[data]);
  return <canvas ref={ref} width={264} height={46} className="spark" />;
}

function NavBtn({icon,label,id,view,setView,badge}){
  return (
    <button type="button" className={'nav-btn'+(view===id?' active':'')}
      aria-current={view===id?'page':undefined} onClick={()=>setView(id)}>
      <span className="ico">{icon}</span>{label}
      {badge>0 && <span className="badge">{badge}</span>}
    </button>
  );
}

function Sidebar({view,setView,balance,pnlToday,tasksDone,notifs,equity,statusLabel,running,agents,cryptoBalance,cryptoPnl,cryptoPrices,cryptoAvailable,cryptoPositions,cryptoAgents,cryptoNotifs,gatewayStatus}){
  const listRef = React.useRef(null);
  const currentAgents = view === 'crypto' ? cryptoAgents : agents;
  const currentNotifs = view === 'crypto' ? cryptoNotifs : notifs;
  const portfolio = gatewayStatus?.portfolio?.status === 'AVAILABLE' ? gatewayStatus.portfolio : null;
  const portfolioPositions = portfolio?.positions || [];
  const spotBalances = portfolio?.spotBalances || [];

  return (
    <aside className="sidebar">
      <div className="side-card frame tight">
        <div className="brand">
          <div className="ava"><AvatarFace scale={4} /></div>
          <div>
            <h1>PIXELTRADE</h1>
            <div className="sub">
              <span className="status-dot" style={{background: running?'var(--up)':'var(--gold)'}}></span>
              {running? `${currentAgents?currentAgents.length:0} agents on the floor` : 'floor paused'}
            </div>
            <div style={{marginTop:6}}><LiveBadge /></div>
          </div>
        </div>
      </div>

      <div className="side-card frame tight">
        <nav className="nav">
          <NavBtn icon="🏠" label="Stocks"     id="dashboard" view={view} setView={setView} />
          <NavBtn icon="🪙" label="Crypto"     id="crypto"    view={view} setView={setView} />
          <NavBtn icon="🧠" label="Analysis"   id="analysis"  view={view} setView={setView} />
          <NavBtn icon="📜" label="History"    id="history"   view={view} setView={setView} badge={0} />
          <NavBtn icon="⚙️" label="Settings"   id="settings"  view={view} setView={setView} />
        </nav>
      </div>

      {(view === 'dashboard' || view === 'analysis') && (
      <div className="side-card frame">
        <div className="label">📈 Stocks Stats</div>
        <div className="stats">
          <div className="stat"><span className="k">Balance</span><span className="v">{fmtMoney(balance)}</span></div>
          <div className="stat"><span className="k">P&amp;L Today</span>
            <span className={'v '+(pnlToday>=0?'up':'down')}>{fmtSigned(pnlToday)}</span></div>
          <div className="stat"><span className="k">Tasks Done</span><span className="v">{tasksDone}</span></div>
        </div>
        <Spark data={equity} />
      </div>
      )}

      {(view === 'crypto' || view === 'analysis') && (
      <div className="side-card frame">
        <div className="label">🪙 Crypto <span className="mode-tag">{gatewayStatus?.online ? gatewayStatus.mode : 'OFFLINE'}</span></div>
        <div className="stats">
          <div className="stat"><span className="k">Private Gateway</span>
            <span className="v">{gatewayStatus?.online ? (gatewayStatus.engineBusy ? 'BUSY' : 'READY') : 'OFFLINE'}</span></div>
          <div className="stat"><span className="k">Risk State</span>
            <span className="v">{gatewayStatus?.riskStateReady ? 'READY' : 'NOT SET'}</span></div>
          <div className="stat"><span className="k">Account</span>
            <span className="v mono">{portfolio ? `${portfolio.accountAddress.slice(0,6)}…${portfolio.accountAddress.slice(-4)}` : '—'}</span></div>
          <div className="stat"><span className="k">Equity</span>
            <span className="v">{portfolio ? fmtMoney(portfolio.accountValue) : '—'}</span></div>
          <div className="stat"><span className="k">Withdrawable</span>
            <span className="v">{portfolio ? fmtMoney(portfolio.withdrawable) : '—'}</span></div>
          <div className="stat"><span className="k">Unrealized P&amp;L</span>
            <span className={'v '+((portfolio?.totalUnrealizedPnl??0)>=0?'up':'down')}>
              {portfolio ? fmtSigned(portfolio.totalUnrealizedPnl) : '—'}</span></div>
          <div className="stat"><span className="k">P&amp;L Today</span>
            <span className={'v '+((gatewayStatus?.dailyPnl??0)>=0?'up':'down')}>
              {gatewayStatus?.dailyPnl == null ? '—' : fmtSigned(gatewayStatus.dailyPnl)}</span></div>
          <div className="stat"><span className="k">Trades Today</span>
            <span className="v">{gatewayStatus?.tradesToday == null ? '—' : gatewayStatus.tradesToday}</span></div>
          <div className="stat"><span className="k">BTC</span>
            <span className="v mono">{cryptoPrices.BTC ? '$'+cryptoPrices.BTC.price.toLocaleString('en-US',{maximumFractionDigits:0}) : '—'}</span></div>
          <div className="stat"><span className="k">ETH</span>
            <span className="v mono">{cryptoPrices.ETH ? '$'+cryptoPrices.ETH.price.toLocaleString('en-US',{maximumFractionDigits:0}) : '—'}</span></div>
        </div>
        {portfolioPositions.length > 0 && (
          <div className="positions">
            <div className="label" style={{fontSize:'9px',marginTop:'6px'}}>OPEN POSITIONS</div>
            {portfolioPositions.map(p => (
              <div key={p.coin} className="stat" style={{fontSize:'10px'}}>
                <span className="k">{p.coin} {p.side === 'LONG' ? '▲' : '▼'} {p.leverage}×</span>
                <span className={'v '+(p.unrealizedPnl>=0?'up':'down')}>
                  {p.unrealizedPnl>=0?'+':''}{p.unrealizedPnl.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
        {spotBalances.length > 0 && (
          <div className="positions">
            <div className="label" style={{fontSize:'9px',marginTop:'6px'}}>SPOT BALANCES</div>
            {spotBalances.slice(0,5).map(p => (
              <div key={p.coin} className="stat" style={{fontSize:'10px'}}>
                <span className="k">{p.coin}</span>
                <span className="v">{p.total.toLocaleString('en-US',{maximumFractionDigits:6})}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      <div className="side-card frame tight">
        <div className="label">The Team</div>
        <div className="team">
          {(currentAgents||[]).map(a=>{
            const act = a.phase==='working' ? (a.atStation||'working')
                      : a.phase==='walking' ? 'on the move' : 'idle';
            return (
              <div className="teammate" key={a.id} title={`${a.name} · ${a.role} — ${act}`}>
                <div className="tm-face" style={{borderColor:a.tint}}>
                  <MiniFace palette={a.palette} map={a.map} scale={3} />
                  <span className={'tm-dot'+(a.phase==='working'?' on':a.phase==='walking'?' go':'')}></span>
                </div>
                <div className="tm-name">{a.name}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="side-card frame notif-wrap">
        <div className="label">Activity Log</div>
        <div className="notif-list" ref={listRef}>
          {currentNotifs.length===0 && <div className="mono muted" style={{fontSize:16}}>Waiting for the agent…</div>}
          {currentNotifs.map(n=>(
            <div key={n.id} className={'notif '+(n.kind||'plain')}>
              <span className="ic">{n.ic}</span>
              <div>
                <div className="tx">{n.text}</div>
                <div className="tm">
                  {n.who && <span className="who" style={{color:n.tint}}>{n.who}</span>}
                  {n.who && ' · '}{n.time}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

Object.assign(window, { Sidebar, Spark, LiveBadge });
