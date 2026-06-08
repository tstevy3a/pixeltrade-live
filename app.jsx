/* ===== App: state, multi-agent simulation loop, wiring ===== */
const {useState, useRef, useEffect} = React;

const START_BAL = 12480;

// agent start positions (spread around the floor) — % of room
const STARTS = [
  {x:42,y:58},{x:52,y:62},{x:46,y:66},{x:70,y:64},{x:30,y:70},{x:58,y:52},
];

function App(){
  const [view,setView]       = useState('dashboard');
  const [cryptoView,setCryptoView] = useState('dashboard');
  const [cryptoMode,setCryptoMode] = useState('paper');  // 'paper' or 'live' (live requires explicit enable)
  const [balance,setBalance] = useState(START_BAL);
  const [pnlToday,setPnl]    = useState(0);
  const [tasks,setTasks]     = useState(0);
  const [notifs,setNotifs]   = useState([]);
  const [history,setHistory] = useState([]);
  const [analyses,setAnalyses] = useState([]);
  const [activeAnalysisId,setActiveAnalysisId] = useState(null);
  const [equity,setEquity]   = useState([START_BAL]);
  const [agentView,setAgentView] = useState(
    AGENTS.map((a,i)=>({...a, pos:{...STARTS[i]}, flip:false, walking:false, bubble:null})));
  const [busySet,setBusySet] = useState({});       // stationId -> agentId
  const [floor,setFloor]     = useState({working:0, walking:0});
  const [clock,setClock] = useState(fmtClock());
  useEffect(()=>{ const t=setInterval(()=>setClock(fmtClock()),1000); return()=>clearInterval(t); },[]);
  const [day,setDay]         = useState(1);
  const [speed,setSpeed]     = useState(1);
  const [settings,setSettings] = useState({autopilot:true, anim:true, tint:true, aggr:1, labels:true, names:true, tz:'ICT'});
  const [cryptoPrices, setCryptoPrices] = useState({});
  const [cryptoAgentView, setCryptoAgentView] = useState(
    (window.CRYPTO_AGENTS || []).map((a,i)=>({...a, pos:{...CRYPTO_STARTS[i]}, flip:false, walking:false, bubble:null})));
  const [cryptoBusySet, setCryptoBusySet] = useState({});
  const [cryptoFloor, setCryptoFloor] = useState({working:0, walking:0});
  const [cryptoBalance, setCryptoBalance] = useState(0);
  const [cryptoPnl, setCryptoPnl] = useState(0);
  const [cryptoAvailable, setCryptoAvailable] = useState(0);
  const [cryptoPositions, setCryptoPositions] = useState([]);
  const [cryptoNotifs, setCryptoNotifs] = useState([]);
  const [cryptoHistory, setCryptoHistory] = useState([]);

  // ---- mutable sim refs ----
  const agentsRef = useRef(AGENTS.map((a,i)=>({
    id:a.id, name:a.name, role:a.role, tint:a.tint, map:a.map, palette:a.palette,
    pos:{...STARTS[i]}, target:null, phase:'idle',
    workT:0, idleT:rnd(0.4, 2.6+i*0.4), pending:null, lastSt:null, flip:false,
  })));
  // ---- crypto team refs ----
  const cryptoAgentsRef = useRef((window.CRYPTO_AGENTS || []).map((a,i)=>({
    id:a.id, name:a.name, role:a.role, tint:a.tint, map:a.map, palette:a.palette,
    pos:{...CRYPTO_STARTS[i]}, target:null, phase:'idle',
    workT:0, idleT:rnd(0.4, 2.6+i*0.4), pending:null, lastSt:null, flip:false,
  })));
  const cryptoBalRef = useRef(100000);
  const cryptoPnlRef = useRef(0);
  const clkRef=useRef(540), dayRef=useRef(1), balRef=useRef(START_BAL), pnlRef=useRef(0), idc=useRef(0);
  const sRef=useRef(settings), spRef=useRef(speed);
  useEffect(()=>{sRef.current=settings;},[settings]);
  useEffect(()=>{spRef.current=speed;},[speed]);

  // ---- subscribe to Hyperliquid price updates ----
  useEffect(()=>{
    if (!window.Hyperliquid) return;
    const off = window.Hyperliquid.onUpdate(snap => {
      setCryptoPrices(snap.prices);
      const p = window.Hyperliquid.getPortfolio();
      if (p && p.balance > 0) {
        setCryptoBalance(p.balance);
        setCryptoAvailable(p.available);
        setCryptoPositions(p.positions || []);
      }
    });
    return () => { if (off) off(); };
  }, []);

  // ---- simulation loop (runs once) ----
  useEffect(()=>{
    const nextId=()=>++idc.current;
    const pushNotif=(n)=>{ const id=nextId(), time=fmtClock();
      setNotifs(l=>[{id,...n,time},...l].slice(0,40)); };
    const pushHist=(h)=>{ const id=nextId();
      setHistory(l=>[{id,...h},...l].slice(0,200)); };

    // stations another agent is already at or heading to
    const occupiedBy=(self)=>{
      const set=new Set();
      agentsRef.current.forEach(o=>{ if(o!==self && o.target) set.add(o.target.id); });
      return set;
    };

    const chooseNext=(self)=>{
      const w=sRef.current.aggr, occ=occupiedBy(self), pool=[];
      STATIONS.forEach(st=>{
        if(occ.has(st.id) && st.zone) return;            // don't double-book work zones
        let wt=2;
        if(st.kind==='trade') wt=[2,3,5][w];
        else if(['analyze','research','backtest','ops','signals','review','plan'].includes(st.kind)) wt=3;
        else wt=[3,2,1][w]; // rest/break
        if(st.id===self.lastSt) wt=Math.max(1,wt-2);
        for(let i=0;i<wt;i++) pool.push(st);
      });
      if(!pool.length) return null;
      return pick(pool);
    };

    const applyOutcome=(self,st,oc)=>{
      let c=clkRef.current+irnd(3,11), d=dayRef.current;
      if(c>=930){ c=540; d+=1; dayRef.current=d; setDay(d);
        pnlRef.current=0; setPnl(0);
        pushNotif({ic:'🔔',text:`Market closed — Day ${d} begins`,kind:'plain'}); }
      clkRef.current=c; setClock(c);
      if(oc.balanceDelta){ balRef.current+=oc.balanceDelta; setBalance(Math.round(balRef.current));
        pnlRef.current+=oc.pnlDelta; setPnl(Math.round(pnlRef.current)); }
      if(oc.taskInc) setTasks(t=>t+oc.taskInc);
      setEquity(e=>{ const n=[...e,balRef.current]; return n.length>60?n.slice(-60):n; });
      pushNotif({...oc.notif, who:self.name, tint:self.tint});
      pushHist({ day:d, time:fmtClock(c), who:self.name, tint:self.tint, station:st.name, icon:st.icon,
        action:(oc.bubble||'').replace('…',''), detail:oc.notif.text,
        side:oc.trade&&oc.trade.side, ticker:oc.trade&&oc.trade.ticker,
        qty:oc.trade&&oc.trade.qty, price:oc.trade&&oc.trade.price, pnl:oc.pnlDelta||0 });
    };

    const stepAgent=(self, dts, running)=>{
      if(self.phase==='walking'){
        const t=self.target; if(!t){ self.phase='idle'; self.idleT=rnd(0.4,1.4); return; }
        const dx=t.ax-self.pos.x, dy=t.ay-self.pos.y, dist=Math.hypot(dx,dy);
        if(dist<0.9){
          self.pos={x:t.ax,y:t.ay};
          const oc=generateOutcome(t); self.pending={st:t,oc};
          self.workT=rnd(t.dur[0],t.dur[1]); self.phase='working'; self.bubble=oc.bubble;
        } else {
          const stp=Math.min(dist, 22*dts);
          self.pos={x:self.pos.x+dx/dist*stp, y:self.pos.y+dy/dist*stp};
          if(dx<-0.3) self.flip=true; else if(dx>0.3) self.flip=false;
        }
      } else if(self.phase==='working'){
        self.workT-=dts;
        if(self.workT<=0){
          const p=self.pending; self.pending=null;
          if(p) applyOutcome(self, p.st, p.oc);
          self.phase='idle'; self.idleT=rnd(0.5,2.0); self.bubble=null; self.target=null;
        }
      } else { // idle
        if(running){
          self.idleT-=dts;
          if(self.idleT<=0){
            const nx=chooseNext(self);
            if(nx){ self.target=nx; self.lastSt=nx.id; self.phase='walking'; }
            else self.idleT=0.5;
          }
        }
      }
    };

    const step=(dt)=>{
      const dts=dt*spRef.current, running=sRef.current.autopilot;
      const agents=agentsRef.current;
      agents.forEach(a=> stepAgent(a, dts, running));

      // derive render + busy + floor
      const busy={}; let nW=0, nWalk=0;
      agents.forEach(a=>{
        if(a.phase==='working' && a.target) busy[a.target.id]=a.id;
        if(a.phase==='working') nW++; else if(a.phase==='walking') nWalk++;
      });
      setBusySet(prev=>{
        const pk=Object.keys(prev), bk=Object.keys(busy);
        if(pk.length===bk.length && bk.every(k=>prev[k]===busy[k])) return prev;
        return busy;
      });
      setFloor(prev=> (prev.working===nW && prev.walking===nWalk)? prev : {working:nW, walking:nWalk});
      setAgentView(agents.map(a=>({
        id:a.id, name:a.name, role:a.role, tint:a.tint, map:a.map, palette:a.palette,
        pos:{x:a.pos.x, y:a.pos.y}, flip:a.flip,
        walking:(a.phase==='walking'), bubble:a.bubble,
        phase:a.phase, atStation:a.target&&a.target.name,
      })));
    };

    let raf, last=performance.now();
    const tick=(now)=>{ let dt=(now-last)/1000; last=now; if(dt>0.1)dt=0.1; step(dt); stepCrypto(dt); raf=requestAnimationFrame(tick); };
    raf=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(raf);
  },[]);

  // ---- crypto team simulation ----
  const stepCrypto=(dts)=>{
    const agents=cryptoAgentsRef.current;
    const occ=new Set();
    agents.forEach(o=>{ if(o.target) occ.add(o.target.id); });

    const chooseCryptoNext=(self)=>{
      const pool=[];
      CRYPTO_STATIONS.forEach(st=>{
        if(occ.has(st.id) && st.zone) return;
        let wt=2;
        if(st.kind==='crypto_trade') wt=4;
        else if(['crypto_funding','crypto_hedge','crypto_backtest','crypto_chart','crypto_news','crypto_risk','crypto_spot'].includes(st.kind)) wt=3;
        else wt=[3,2,1][sRef.current.aggr];
        if(st.id===self.lastSt) wt=Math.max(1,wt-2);
        for(let i=0;i<wt;i++) pool.push(st);
      });
      if(!pool.length) return null;
      return pick(pool);
    };

    const stepCryptoAgent=(self)=>{
      if(self.phase==='walking'){
        const t=self.target; if(!t){ self.phase='idle'; self.idleT=rnd(0.4,1.4); return; }
        const dx=t.ax-self.pos.x, dy=t.ay-self.pos.y, dist=Math.hypot(dx,dy);
        if(dist<0.9){
          self.pos={x:t.ax,y:t.ay};
          const oc=window.generateCryptoOutcome(t, self); self.pending={st:t,oc};
          self.workT=rnd(t.dur[0],t.dur[1]); self.phase='working'; self.bubble=oc.bubble;
        } else {
          const stp=Math.min(dist, 22*dts);
          self.pos={x:self.pos.x+dx/dist*stp, y:self.pos.y+dy/dist*stp};
          if(dx<-0.3) self.flip=true; else if(dx>0.3) self.flip=false;
        }
      } else if(self.phase==='working'){
        self.workT-=dts;
        if(self.workT<=0){
          const p=self.pending; self.pending=null;
          if(p && p.oc){
            if(p.oc.crypto_trade){ /* real trade — P&L tracked via Hyperliquid portfolio poll */ }
            if(p.oc.taskInc) {/* tasks only on stocks side */}
            setCryptoNotifs(l=>[{id:++idc.current, ...p.oc.notif, time:fmtClock(), who:self.name, tint:self.tint},...l].slice(0,40));
            setCryptoHistory(l=>[{
              id: ++idc.current,
              day: dayRef.current,
              time: fmtClock(),
              who: self.name,
              tint: self.tint,
              station: p.st.name,
              icon: p.st.icon,
              action: (p.oc.bubble||'').replace('…',''),
              detail: p.oc.notif.text,
              side: p.oc.crypto_trade && p.oc.crypto_trade.side,
              symbol: p.oc.crypto_trade && p.oc.crypto_trade.symbol,
              qty: p.oc.crypto_trade && p.oc.crypto_trade.qty,
              price: p.oc.crypto_trade && p.oc.crypto_trade.price,
              pnl: p.oc.pnlDelta || 0
            }, ...l].slice(0, 200));
          }
          self.phase='idle'; self.idleT=rnd(0.5,2.0); self.bubble=null; self.target=null;
        }
      } else {
        self.idleT-=dts;
        if(self.idleT<=0){
          const nx=chooseCryptoNext(self);
          if(nx){ self.target=nx; self.lastSt=nx.id; self.phase='walking'; }
          else self.idleT=0.5;
        }
      }
    };

    agents.forEach(a=>stepCryptoAgent(a));

    // derive render state
    const busy={}; let nW=0, nWalk=0;
    agents.forEach(a=>{
      if(a.phase==='working' && a.target) busy[a.target.id]=a.id;
      if(a.phase==='working') nW++; else if(a.phase==='walking') nWalk++;
    });
    setCryptoBusySet(prev=>{
      const pk=Object.keys(prev), bk=Object.keys(busy);
      if(pk.length===bk.length && bk.every(k=>prev[k]===busy[k])) return prev;
      return busy;
    });
    setCryptoFloor(prev=> (prev.working===nW && prev.walking===nWalk)? prev : {working:nW, walking:nWalk});
    setCryptoAgentView(agents.map(a=>({
      id:a.id, name:a.name, role:a.role, tint:a.tint, map:a.map, palette:a.palette,
      pos:{x:a.pos.x, y:a.pos.y}, flip:a.flip,
      walking:(a.phase==='walking'), bubble:a.bubble,
      phase:a.phase, atStation:a.target&&a.target.name,
    })));
  };

  // ---- handlers ----
  const onStationClick=(st)=>{
    // send the nearest non-working agent to this station
    const cands=agentsRef.current.filter(a=>a.phase!=='working');
    const list=cands.length?cands:agentsRef.current;
    let best=list[0], bd=Infinity;
    list.forEach(a=>{ const d=Math.hypot(a.pos.x-st.ax, a.pos.y-st.ay); if(d<bd){bd=d;best=a;} });
    best.target=st; best.lastSt=st.id; best.pending=null; best.phase='walking'; best.bubble=null;
    if(view!=='dashboard') setView('dashboard');
  };
  const onCryptoStationClick=(st)=>{
    const cands=cryptoAgentsRef.current.filter(a=>a.phase!=='working');
    const list=cands.length?cands:cryptoAgentsRef.current;
    let best=list[0], bd=Infinity;
    list.forEach(a=>{ const d=Math.hypot(a.pos.x-st.ax, a.pos.y-st.ay); if(d<bd){bd=d;best=a;} });
    best.target=st; best.lastSt=st.id; best.pending=null; best.phase='walking'; best.bubble=null;
  };
  const onCreateAnalysis=(analysis)=>{
    setAnalyses(list=>[analysis,...list]);
    setActiveAnalysisId(analysis.id);
    if(view!=='analysis') setView('analysis');
  };
  const togglePlay=()=> setSettings(s=>({...s,autopilot:!s.autopilot}));
  const onReset=()=>{
    balRef.current=START_BAL; pnlRef.current=0; clkRef.current=540; dayRef.current=1;
    agentsRef.current.forEach((a,i)=>{ a.pos={...STARTS[i]}; a.target=null; a.phase='idle';
      a.workT=0; a.idleT=rnd(0.4,2.6+i*0.4); a.pending=null; a.lastSt=null; a.flip=false; a.bubble=null; });
    cryptoPnlRef.current=0;
    cryptoAgentsRef.current.forEach((a,i)=>{ a.pos={...CRYPTO_STARTS[i]}; a.target=null; a.phase='idle';
      a.workT=0; a.idleT=rnd(0.4,2.6+i*0.4); a.pending=null; a.lastSt=null; a.flip=false; a.bubble=null; });
    setBalance(START_BAL); setPnl(0); setTasks(0); setNotifs([]); setHistory([]);
    setCryptoPnl(0); setCryptoNotifs([]); setCryptoHistory([]);  // ไม่ reset cryptoBalance — ใช้จาก Hyperliquid จริง
    setEquity([START_BAL]); setBusySet({}); setClock(540); setDay(1);
    setAgentView(AGENTS.map((a,i)=>({...a, pos:{...STARTS[i]}, flip:false, walking:false, bubble:null})));
    setCryptoAgentView((window.CRYPTO_AGENTS || []).map((a,i)=>({...a, pos:{...CRYPTO_STARTS[i]}, flip:false, walking:false, bubble:null})));
    setCryptoBusySet({});
  };

  const statusLine = settings.autopilot
    ? `${floor.working} working · ${floor.walking} walking`
    : 'Floor paused — agents idle';

  return (
    <div className={'app'+(settings.anim?'':' no-anim')}>
      <div className="main">
        <div className="hud frame">
          <div className="ctrl">
            <button className={'btn '+(settings.autopilot?'on':'gold')} onClick={togglePlay}>
              {settings.autopilot?'⏸ Pause':'▶ Resume'}</button>
          </div>
          <div className="now">
            <div className="pin">🤖</div>
            <div className="txt">
              <div className="lab">The Floor · {AGENTS.length} agents</div>
              <div className="act">{statusLine}</div>
            </div>
          </div>
          <div className="clock">{clock} ICT</div>
        </div>

        {view==='dashboard' &&
          <Room agents={agentView} busySet={busySet} onStationClick={onStationClick}
            tint={settings.tint} showLabels={settings.labels} showNames={settings.names} />}
        {view==='crypto' && <CryptoRoom agents={cryptoAgentView} busySet={cryptoBusySet}
            onStationClick={onCryptoStationClick} prices={cryptoPrices} cryptoMode={cryptoMode} />}
        {view==='analysis'  && <Analysis analyses={analyses} activeAnalysisId={activeAnalysisId}
            setActiveAnalysisId={setActiveAnalysisId} onCreateAnalysis={onCreateAnalysis}
            agents={agentView} />}
        {view==='history'   && <History history={[...history, ...cryptoHistory].sort((a,b)=>b.id-a.id)} />}
        {view==='settings'  && <Settings settings={settings} setSettings={setSettings}
            onReset={onReset} speed={speed} setSpeed={setSpeed} />}
      </div>

      <Sidebar view={view} setView={setView} balance={balance} pnlToday={pnlToday}
        tasksDone={tasks} notifs={notifs} equity={equity} running={settings.autopilot}
        agents={agentView}
        cryptoBalance={cryptoBalance} cryptoPnl={cryptoPnl} cryptoPrices={cryptoPrices}
        cryptoAvailable={cryptoAvailable} cryptoPositions={cryptoPositions}
        cryptoAgents={cryptoAgentView} cryptoNotifs={cryptoNotifs} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
