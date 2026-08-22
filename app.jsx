/* ===== PixelTrade: crypto-only dashboard wiring ===== */
const {useState,useRef,useEffect}=React;

function App(){
  const [view,setView]=useState('crypto');
  const [clock,setClock]=useState(fmtClock());
  const [speed,setSpeed]=useState(1);
  const [settings,setSettings]=useState({autopilot:true,anim:true,aggr:1,names:true});
  const [cryptoPrices,setCryptoPrices]=useState({});
  const [publicPortfolio,setPublicPortfolio]=useState(null);
  const [cryptoNotifs,setCryptoNotifs]=useState([]);
  const [cryptoAgentView,setCryptoAgentView]=useState(
    (window.CRYPTO_AGENTS||[]).map((agent,index)=>({
      ...agent,pos:{...CRYPTO_STARTS[index]},flip:false,walking:false,bubble:null,
    })),
  );
  const [cryptoBusySet,setCryptoBusySet]=useState({});
  const [cryptoFloor,setCryptoFloor]=useState({working:0,walking:0});
  const [gatewayStatus,setGatewayStatus]=useState(
    window.PixelGateway?window.PixelGateway.getStatus():{online:false,mode:'OFFLINE',lastEvent:null},
  );

  const eventId=useRef(0);
  const settingsRef=useRef(settings);
  const speedRef=useRef(speed);
  const cryptoAgentsRef=useRef((window.CRYPTO_AGENTS||[]).map((agent,index)=>({
    id:agent.id,name:agent.name,role:agent.role,tint:agent.tint,map:agent.map,palette:agent.palette,
    pos:{...CRYPTO_STARTS[index]},target:null,phase:'idle',workT:0,
    idleT:rnd(0.4,2.6+index*0.4),pending:null,lastSt:null,flip:false,
  })));

  useEffect(()=>{settingsRef.current=settings;},[settings]);
  useEffect(()=>{speedRef.current=speed;},[speed]);
  useEffect(()=>{
    const timer=setInterval(()=>setClock(fmtClock()),1000);
    return ()=>clearInterval(timer);
  },[]);
  useEffect(()=>{
    if(!window.Hyperliquid) return;
    return window.Hyperliquid.onUpdate(snapshot=>{
      setCryptoPrices(snapshot.prices||{});
      if(snapshot.portfolio?.status==='AVAILABLE') setPublicPortfolio(snapshot.portfolio);
    });
  },[]);
  useEffect(()=>{
    if(!window.PixelGateway) return;
    return window.PixelGateway.subscribe(status=>setGatewayStatus(status));
  },[]);

  useEffect(()=>{
    const chooseNext=(self)=>{
      const occupied=new Set();
      cryptoAgentsRef.current.forEach(agent=>{
        if(agent!==self&&agent.target) occupied.add(agent.target.id);
      });
      const pool=[];
      CRYPTO_STATIONS.forEach(station=>{
        if(occupied.has(station.id)&&station.zone) return;
        let weight=2;
        if(station.kind==='crypto_trade') weight=4;
        else if(['crypto_funding','crypto_hedge','crypto_backtest','crypto_chart','crypto_news','crypto_risk','crypto_spot','crypto_committee'].includes(station.kind)) weight=3;
        else weight=[3,2,1][settingsRef.current.aggr];
        if(station.id===self.lastSt) weight=Math.max(1,weight-2);
        for(let index=0;index<weight;index++) pool.push(station);
      });
      return pool.length?pick(pool):null;
    };

    const stepAgent=(self,delta)=>{
      if(self.phase==='walking'){
        const target=self.target;
        if(!target){self.phase='idle';self.idleT=rnd(0.4,1.4);return;}
        const dx=target.ax-self.pos.x;
        const dy=target.ay-self.pos.y;
        const distance=Math.hypot(dx,dy);
        if(distance<0.9){
          self.pos={x:target.ax,y:target.ay};
          const outcome=window.generateCryptoOutcome(target,self);
          self.pending={station:target,outcome};
          self.workT=rnd(target.dur[0],target.dur[1]);
          self.phase='working';
          self.bubble=outcome.bubble;
        }else{
          const movement=Math.min(distance,22*delta);
          self.pos={x:self.pos.x+dx/distance*movement,y:self.pos.y+dy/distance*movement};
          if(dx<-0.3) self.flip=true;
          else if(dx>0.3) self.flip=false;
        }
        return;
      }
      if(self.phase==='working'){
        self.workT-=delta;
        if(self.workT<=0){
          const pending=self.pending;
          if(pending?.outcome){
            setCryptoNotifs(list=>[{
              id:++eventId.current,...pending.outcome.notif,time:fmtClock(),who:self.name,tint:self.tint,
            },...list].slice(0,40));
          }
          self.pending=null;self.phase='idle';self.idleT=rnd(0.5,2.0);
          self.bubble=null;self.target=null;
        }
        return;
      }
      if(!settingsRef.current.autopilot) return;
      self.idleT-=delta;
      if(self.idleT<=0){
        const next=chooseNext(self);
        if(next){self.target=next;self.lastSt=next.id;self.phase='walking';}
        else self.idleT=0.5;
      }
    };

    const renderState=()=>{
      const busy={};
      let working=0;
      let walking=0;
      cryptoAgentsRef.current.forEach(agent=>{
        if(agent.phase==='working'&&agent.target) busy[agent.target.id]=agent.id;
        if(agent.phase==='working') working++;
        else if(agent.phase==='walking') walking++;
      });
      setCryptoBusySet(previous=>{
        const keys=Object.keys(busy);
        return Object.keys(previous).length===keys.length&&keys.every(key=>previous[key]===busy[key])?previous:busy;
      });
      setCryptoFloor(previous=>previous.working===working&&previous.walking===walking?previous:{working,walking});
      setCryptoAgentView(cryptoAgentsRef.current.map(agent=>({
        id:agent.id,name:agent.name,role:agent.role,tint:agent.tint,map:agent.map,palette:agent.palette,
        pos:{...agent.pos},flip:agent.flip,walking:agent.phase==='walking',bubble:agent.bubble,
        phase:agent.phase,atStation:agent.target?.name,
      })));
    };

    let frame;
    let previous=performance.now();
    const tick=(now)=>{
      let delta=(now-previous)/1000;
      previous=now;
      if(delta>0.1) delta=0.1;
      const scaled=delta*speedRef.current;
      cryptoAgentsRef.current.forEach(agent=>stepAgent(agent,scaled));
      renderState();
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(frame);
  },[]);

  const onCryptoStationClick=(station)=>{
    const available=cryptoAgentsRef.current.filter(agent=>agent.phase!=='working');
    const candidates=available.length?available:cryptoAgentsRef.current;
    let nearest=candidates[0];
    let nearestDistance=Infinity;
    candidates.forEach(agent=>{
      const distance=Math.hypot(agent.pos.x-station.ax,agent.pos.y-station.ay);
      if(distance<nearestDistance){nearestDistance=distance;nearest=agent;}
    });
    if(!nearest) return;
    nearest.target=station;nearest.lastSt=station.id;nearest.pending=null;
    nearest.phase='walking';nearest.bubble=null;
    if(view!=='crypto') setView('crypto');
  };

  const resetDisplay=()=>{
    cryptoAgentsRef.current.forEach((agent,index)=>{
      agent.pos={...CRYPTO_STARTS[index]};agent.target=null;agent.phase='idle';agent.workT=0;
      agent.idleT=rnd(0.4,2.6+index*0.4);agent.pending=null;agent.lastSt=null;
      agent.flip=false;agent.bubble=null;
    });
    setCryptoNotifs([]);
    setCryptoBusySet({});
    setCryptoFloor({working:0,walking:0});
  };

  const displayGatewayStatus=gatewayStatus?.portfolio?.status==='AVAILABLE'
    ?gatewayStatus:{...gatewayStatus,portfolio:publicPortfolio};
  const displayStatus=settings.autopilot
    ?`${cryptoFloor.working} working · ${cryptoFloor.walking} walking`:'Visualization paused';

  return (
    <div className={'app'+(settings.anim?'':' no-anim')}>
      <main className="main">
        <header className="hud frame">
          <div className="ctrl">
            <button className={'btn '+(settings.autopilot?'on':'gold')}
              onClick={()=>setSettings(current=>({...current,autopilot:!current.autopilot}))}>
              {settings.autopilot?'⏸ Pause display':'▶ Resume display'}
            </button>
          </div>
          <div className="now">
            <div className="pin">₿</div>
            <div className="txt">
              <div className="lab">Crypto Floor · {CRYPTO_AGENTS.length} agents</div>
              <div className="act">{displayStatus} · execution remains independent</div>
            </div>
          </div>
          <div className="clock">{clock} ICT</div>
        </header>

        {view==='crypto'&&<CryptoRoom agents={cryptoAgentView} busySet={cryptoBusySet}
          onStationClick={onCryptoStationClick} prices={cryptoPrices} gatewayStatus={displayGatewayStatus}
          showNames={settings.names}/>}
        {view==='history'&&<History history={[]}/>}
        {view==='settings'&&<Settings settings={settings} setSettings={setSettings}
          onReset={resetDisplay} speed={speed} setSpeed={setSpeed}/>}
      </main>

      <Sidebar view={view} setView={setView} running={settings.autopilot}
        cryptoPrices={cryptoPrices} cryptoAgents={cryptoAgentView}
        cryptoNotifs={cryptoNotifs} gatewayStatus={displayGatewayStatus}/>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
