/* ===== Crypto-only sidebar ===== */

function NavBtn({icon,label,id,view,setView}){
  return (
    <button type="button" className={'nav-btn'+(view===id?' active':'')}
      aria-current={view===id?'page':undefined} onClick={()=>setView(id)}>
      <span className="ico" aria-hidden="true">{icon}</span>{label}
    </button>
  );
}

function Sidebar({view,setView,running,cryptoPrices,cryptoAgents,cryptoNotifs,gatewayStatus}){
  const portfolio=gatewayStatus?.portfolio?.status==='AVAILABLE' ? gatewayStatus.portfolio : null;
  const positions=portfolio?.positions || [];
  const spotBalances=portfolio?.spotBalances || [];
  const mode=gatewayStatus?.online ? gatewayStatus.mode : 'OFFLINE';

  return (
    <aside className="sidebar">
      <div className="side-card frame tight">
        <div className="brand">
          <div className="ava"><AvatarFace scale={4} /></div>
          <div>
            <h1>PIXELTRADE</h1>
            <div className="sub">
              <span className="status-dot" style={{background:gatewayStatus?.online?'var(--up)':'var(--gold)'}}></span>
              {gatewayStatus?.online ? `${mode} gateway online` : 'private gateway offline'}
            </div>
          </div>
        </div>
      </div>

      <div className="side-card frame tight">
        <nav className="nav" aria-label="PixelTrade navigation">
          <NavBtn icon="₿" label="Crypto" id="crypto" view={view} setView={setView} />
          <NavBtn icon="≡" label="History" id="history" view={view} setView={setView} />
          <NavBtn icon="⚙" label="Settings" id="settings" view={view} setView={setView} />
        </nav>
      </div>

      <div className="side-card frame">
        <div className="label">Crypto <span className="mode-tag">{mode}</span></div>
        <div className="stats">
          <div className="stat"><span className="k">Private Gateway</span>
            <span className="v">{gatewayStatus?.online ? (gatewayStatus.engineBusy?'BUSY':'READY') : 'OFFLINE'}</span></div>
          <div className="stat"><span className="k">Auto Runner</span>
            <span className="v">{gatewayStatus?.autoRunEnabled?'ON':'OFF'}</span></div>
          <div className="stat"><span className="k">Protection</span>
            <span className="v">{gatewayStatus?.protectionAudit?.status || '—'}</span></div>
          <div className="stat"><span className="k">Risk State</span>
            <span className="v">{gatewayStatus?.riskStateReady?'READY':'NOT SET'}</span></div>
          <div className="stat"><span className="k">Account</span>
            <span className="v mono">{portfolio?`${portfolio.accountAddress.slice(0,6)}…${portfolio.accountAddress.slice(-4)}`:'—'}</span></div>
          <div className="stat"><span className="k">Equity</span>
            <span className="v">{portfolio?fmtMoney(portfolio.accountValue):'—'}</span></div>
          <div className="stat"><span className="k">Withdrawable</span>
            <span className="v">{portfolio?fmtMoney(portfolio.withdrawable):'—'}</span></div>
          <div className="stat"><span className="k">Unrealized P&amp;L</span>
            <span className={'v '+((portfolio?.totalUnrealizedPnl??0)>=0?'up':'down')}>
              {portfolio?fmtSigned(portfolio.totalUnrealizedPnl):'—'}</span></div>
          <div className="stat"><span className="k">P&amp;L Today</span>
            <span className={'v '+((gatewayStatus?.dailyPnl??0)>=0?'up':'down')}>
              {gatewayStatus?.dailyPnl==null?'—':fmtSigned(gatewayStatus.dailyPnl)}</span></div>
          <div className="stat"><span className="k">Trades Today</span>
            <span className="v">{gatewayStatus?.tradesToday==null?'—':gatewayStatus.tradesToday}</span></div>
          <div className="stat"><span className="k">BTC</span>
            <span className="v mono">{cryptoPrices.BTC?'$'+cryptoPrices.BTC.price.toLocaleString('en-US',{maximumFractionDigits:0}):'—'}</span></div>
          <div className="stat"><span className="k">ETH</span>
            <span className="v mono">{cryptoPrices.ETH?'$'+cryptoPrices.ETH.price.toLocaleString('en-US',{maximumFractionDigits:0}):'—'}</span></div>
        </div>

        {positions.length>0 && <div className="positions">
          <div className="label" style={{fontSize:'9px',marginTop:'6px'}}>OPEN POSITIONS</div>
          {positions.map(position=><div key={position.coin} className="stat" style={{fontSize:'10px'}}>
            <span className="k">{position.coin} {position.side==='LONG'?'▲':'▼'} {position.leverage}×</span>
            <span className={'v '+(position.unrealizedPnl>=0?'up':'down')}>
              {position.unrealizedPnl>=0?'+':''}{position.unrealizedPnl.toFixed(2)}</span>
          </div>)}
        </div>}

        {spotBalances.length>0 && <div className="positions">
          <div className="label" style={{fontSize:'9px',marginTop:'6px'}}>SPOT BALANCES</div>
          {spotBalances.slice(0,5).map(balance=><div key={balance.coin} className="stat" style={{fontSize:'10px'}}>
            <span className="k">{balance.coin}</span>
            <span className="v">{balance.total.toLocaleString('en-US',{maximumFractionDigits:6})}</span>
          </div>)}
        </div>}
      </div>

      <div className="side-card frame tight">
        <div className="label">Crypto Team</div>
        <div className="team">
          {(cryptoAgents||[]).map(agent=>{
            const activity=agent.phase==='working' ? (agent.atStation||'working')
              : agent.phase==='walking' ? 'on the move' : 'idle';
            return <div className="teammate" key={agent.id} title={`${agent.name} · ${agent.role} — ${activity}`}>
              <div className="tm-face" style={{borderColor:agent.tint}}>
                <MiniFace palette={agent.palette} map={agent.map} scale={3} />
                <span className={'tm-dot'+(agent.phase==='working'?' on':agent.phase==='walking'?' go':'')}></span>
              </div>
              <div className="tm-name">{agent.name}</div>
            </div>;
          })}
        </div>
      </div>

      <div className="side-card frame notif-wrap">
        <div className="label">Display Activity</div>
        <div className="notif-list">
          {cryptoNotifs.length===0 && <div className="mono muted" style={{fontSize:16}}>
            {running?'Waiting for the crypto team…':'Visualization paused'}
          </div>}
          {cryptoNotifs.map(notification=><div key={notification.id} className={'notif '+(notification.kind||'plain')}>
            <span className="ic">{notification.ic}</span>
            <div>
              <div className="tx">{notification.text}</div>
              <div className="tm">
                {notification.who && <span className="who" style={{color:notification.tint}}>{notification.who}</span>}
                {notification.who && ' · '}{notification.time}
              </div>
            </div>
          </div>)}
        </div>
      </div>
    </aside>
  );
}

Object.assign(window,{Sidebar});
