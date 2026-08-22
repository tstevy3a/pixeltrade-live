/* ===== Crypto activity and display settings ===== */

function History({history}){
  return (
    <div className="view-pane frame">
      <h2>Trade &amp; Activity History</h2>
      <div className="desc">Only verified crypto execution events belong here.</div>
      <div className="table">
        <table>
          <thead><tr>
            <th>Time</th><th>Agent</th><th>Station</th><th>Action</th><th>Detail</th><th style={{textAlign:'right'}}>P&amp;L</th>
          </tr></thead>
          <tbody>
            {history.length===0 && <tr><td colSpan="6" className="muted">No verified execution history loaded.</td></tr>}
            {history.map(item=><tr key={item.id}>
              <td className="muted">{item.time||'—'}</td>
              <td><span className="who" style={{color:item.tint}}>{item.who||'—'}</span></td>
              <td>{item.station||'—'}</td>
              <td>{item.action||'—'}</td>
              <td><span className="muted">{item.detail||'—'}</span></td>
              <td style={{textAlign:'right'}} className={item.pnl>0?'up':item.pnl<0?'down':''}>
                {item.pnl?fmtSigned(item.pnl):'—'}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Toggle({on,onClick}){
  return <button type="button" className={'toggle'+(on?' on':'')} aria-pressed={on}
    aria-label={on?'Enabled':'Disabled'} onClick={onClick}><span className="knob"></span></button>;
}

function Settings({settings,setSettings,onReset,speed,setSpeed}){
  const set=(key,value)=>setSettings(current=>({...current,[key]:value}));
  return (
    <div className="view-pane frame">
      <h2>Display Settings</h2>
      <div className="desc">These controls change the visualization only. They never arm, pause, or reset live trading.</div>

      <div className="set-row">
        <div className="k">Agent movement<small>Let the display agents move between crypto work zones</small></div>
        <Toggle on={settings.autopilot} onClick={()=>set('autopilot',!settings.autopilot)} />
      </div>
      <div className="set-row">
        <div className="k">Animations<small>Walking, station pulses, and activity bubbles</small></div>
        <Toggle on={settings.anim} onClick={()=>set('anim',!settings.anim)} />
      </div>
      <div className="set-row">
        <div className="k">Agent names<small>Show each crypto agent's name on the floor</small></div>
        <Toggle on={settings.names} onClick={()=>set('names',!settings.names)} />
      </div>
      <div className="set-row">
        <div className="k">Display activity<small>Controls how often agents visit visualization stations</small></div>
        <div className="seg">
          {['Calm','Steady','Busy'].map((label,index)=><button key={label}
            className={settings.aggr===index?'on':''} onClick={()=>set('aggr',index)}>{label}</button>)}
        </div>
      </div>
      <div className="set-row">
        <div className="k">Animation speed<small>Does not change market scans or order timing</small></div>
        <div className="seg">
          {[1,2,4].map(value=><button key={value} className={speed===value?'on':''}
            onClick={()=>setSpeed(value)}>{value}×</button>)}
        </div>
      </div>
      <div className="set-row" style={{borderBottom:'none'}}>
        <div className="k">Reset display<small>Clear visualization activity and return agents to their starting positions</small></div>
        <button type="button" className="btn gold" onClick={onReset}>Reset display</button>
      </div>
    </div>
  );
}

Object.assign(window,{History,Settings,Toggle});
