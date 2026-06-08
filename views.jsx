/* ===== Secondary views: History & Settings ===== */

function History({history}){
  return (
    <div className="view-pane frame">
      <h2>📜 Trade & Activity History</h2>
      <div className="desc">Every action the agent has taken this session — newest first.</div>
      <div className="table">
        <table>
          <thead><tr>
            <th>Time</th><th>Agent</th><th>Station</th><th>Action</th><th>Detail</th><th style={{textAlign:'right'}}>P&amp;L</th>
          </tr></thead>
          <tbody>
            {history.length===0 && <tr><td colSpan="6" className="muted">No activity yet — head to the Dashboard.</td></tr>}
            {history.map(h=>(
              <tr key={h.id}>
                <td className="muted">D{h.day} · {h.time}</td>
                <td><span className="who" style={{color:h.tint}}>{h.who||'—'}</span></td>
                <td>{h.icon} {h.station}</td>
                <td>{h.action}</td>
                <td>{h.side
                    ? <span className={'pill '+(h.side==='BUY'?'buy':'sell')}>{h.side} {h.ticker} ×{h.qty} @ ${h.price}</span>
                    : <span className="muted">{h.detail||'—'}</span>}</td>
                <td style={{textAlign:'right'}} className={h.pnl>0?'up':h.pnl<0?'down':''}>
                  {h.pnl? fmtSigned(h.pnl) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Toggle({on,onClick}){ return <div className={'toggle'+(on?' on':'')} onClick={onClick}><div className="knob"></div></div>; }

function Settings({settings, setSettings, onReset, speed, setSpeed}){
  const set = (k,v)=> setSettings(s=>({...s,[k]:v}));
  return (
    <div className="view-pane frame">
      <h2>⚙️ Settings</h2>
      <div className="desc">Tune how your agent behaves and how the office feels.</div>

      <div className="set-row">
        <div className="k">Autopilot<small>Agent roams and trades on its own</small></div>
        <Toggle on={settings.autopilot} onClick={()=>set('autopilot',!settings.autopilot)} />
      </div>
      <div className="set-row">
        <div className="k">Animations<small>Walking bob, pulsing stations, pop-ins</small></div>
        <Toggle on={settings.anim} onClick={()=>set('anim',!settings.anim)} />
      </div>
      <div className="set-row">
        <div className="k">Evening light<small>Warm vignette over the room</small></div>
        <Toggle on={settings.tint} onClick={()=>set('tint',!settings.tint)} />
      </div>
      <div className="set-row">
        <div className="k">Zone labels<small>Show nameplates on every work zone</small></div>
        <Toggle on={settings.labels} onClick={()=>set('labels',!settings.labels)} />
      </div>
      <div className="set-row">
        <div className="k">Agent names<small>Floating name tag under each agent</small></div>
        <Toggle on={settings.names} onClick={()=>set('names',!settings.names)} />
      </div>
      <div className="set-row">
        <div className="k">Aggression<small>Higher = more frequent trading</small></div>
        <div className="seg">
          {['Calm','Steady','Bold'].map((l,i)=>(
            <button key={l} className={settings.aggr===i?'on':''} onClick={()=>set('aggr',i)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="set-row">
        <div className="k">Sim speed<small>How fast the day plays out</small></div>
        <div className="seg">
          {[1,2,4].map(s=>(
            <button key={s} className={speed===s?'on':''} onClick={()=>setSpeed(s)}>{s}×</button>
          ))}
        </div>
      </div>
      <div className="set-row" style={{borderBottom:'none'}}>
        <div className="k">Reset session<small>Clear stats, history & balance</small></div>
        <div className="btn gold" onClick={onReset}>↻ Reset</div>
      </div>
    </div>
  );
}

Object.assign(window, { History, Settings, Toggle });
