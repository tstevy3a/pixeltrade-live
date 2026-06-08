/* ===== Analysis view: structured mock agent workflow ===== */

const {ANALYSIS_SCENARIOS, createWorkflowAnalysis, normalizeTicker} = AnalysisModel;

function LivePanel(){
  const [data, setData] = React.useState(window.LiveData ? window.LiveData.getAll() : {});
  const [meta, setMeta] = React.useState(window.LiveData ? window.LiveData.getMeta() : { refreshed_at: null, scan_meta: {} });
  const [_, setTick] = React.useState(0);

  React.useEffect(()=>{
    if (!window.LiveData) return;
    const off = window.LiveData.onUpdate((c)=>{
      setData(c.tickers || {});
      setMeta({
        refreshed_at: c.refreshed_at,
        scan_meta: c.scan_meta || {},
        version: c.version,
        source: c.source,
      });
    });
    // re-render every 30s for age display
    const i = setInterval(()=> setTick(t=>t+1), 30000);
    return ()=> { off && off(); clearInterval(i); };
  }, []);

  const tickers = Object.entries(data);
  const scanType = (meta.scan_meta && meta.scan_meta.scan_type) || '—';
  const scanners = (meta.scan_meta && meta.scan_meta.scanners_used) || [];
  const ageText = meta.refreshed_at
    ? Math.round((Date.now() - Date.parse(meta.refreshed_at)) / 60000) + 'm ago'
    : 'never';

  return (
    <div className="live-panel">
      <h3>📡 Live Indicators</h3>
      <div className="meta">
        {tickers.length === 0
          ? <>No data yet — ask Hermes: <code>refresh pixeltrade indicators</code></>
          : <>Last refresh: <b>{ageText}</b> · scan type: <b>{scanType}</b>{scanners.length>0 && <> · from {scanners.length} scanners</>}</>
        }
      </div>
      {tickers.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Price</th>
              <th>Δ%</th>
              <th>RSI</th>
              <th>MACD</th>
              <th>BB</th>
              <th>Rec</th>
              <th>Reasons</th>
            </tr>
          </thead>
          <tbody>
            {tickers.map(([t, d]) => (
              <tr key={t}>
                <td><b>{t}</b></td>
                <td>${d.price != null ? d.price.toFixed(2) : '—'}</td>
                <td className={d.change_pct >= 0 ? 'up' : 'down'}>
                  {d.change_pct != null ? (d.change_pct >= 0 ? '+' : '') + d.change_pct.toFixed(2) + '%' : '—'}
                </td>
                <td className={d.rsi < 30 ? 'oversold' : d.rsi > 70 ? 'overbought' : ''}>
                  {d.rsi != null ? d.rsi.toFixed(0) : '—'}
                </td>
                <td className={d.macd_signal === 'bullish' ? 'up' : d.macd_signal === 'bearish' ? 'down' : ''}>
                  {d.macd_signal || '—'}
                </td>
                <td>{d.bb_rating != null ? (d.bb_rating > 0 ? '+' : '') + d.bb_rating : '—'}</td>
                <td className={'rec-' + (d.recommendation || 'neutral').toLowerCase().replace('_','-')}>
                  {d.recommendation || '—'}
                </td>
                <td>
                  {(d.picked_reasons || []).map(r => <span className="reason-tag" key={r}>{r.replace(/_/g, ' ')}</span>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ThesisBadge({decision}){
  return <span className={'thesis-badge '+decision.toLowerCase()}>{decision}</span>;
}

function ScenarioPicker({value, onChange}){
  return (
    <div className="scenario-grid">
      {ANALYSIS_SCENARIOS.map(scenario => (
        <button
          key={scenario.id}
          className={'scenario-btn'+(value===scenario.id?' on':'')}
          onClick={() => onChange(scenario.id)}
          type="button">
          <span>{scenario.label}</span>
          <small>{scenario.riskLevel} risk</small>
        </button>
      ))}
    </div>
  );
}

function AnalysisForm({onCreateAnalysis}){
  const [ticker, setTicker] = React.useState('NVDA');
  const [scenarioId, setScenarioId] = React.useState('momentum_breakout');
  const [error, setError] = React.useState('');

  const run = (event) => {
    event.preventDefault();
    const symbol = normalizeTicker(ticker);
    if(!symbol){
      setError('Ticker required');
      return;
    }
    setError('');
    const analysis = createWorkflowAnalysis({
      ticker: symbol,
      scenarioId,
      id: `analysis-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    });
    onCreateAnalysis(analysis);
  };

  return (
    <form className="analysis-form" onSubmit={run}>
      <div className="analysis-input-row">
        <label className="analysis-field">
          <span>Ticker</span>
          <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="NVDA" />
        </label>
        <button className="btn on analysis-run" type="submit">Run Workflow</button>
      </div>
      {error && <div className="analysis-error">{error}</div>}
      <ScenarioPicker value={scenarioId} onChange={setScenarioId} />
    </form>
  );
}

function AnalysisList({analyses, activeAnalysisId, setActiveAnalysisId}){
  if(!analyses.length){
    return <div className="analysis-empty mono">No analysis yet.</div>;
  }
  return (
    <div className="analysis-session-list">
      {analyses.map(item => (
        <button
          key={item.id}
          type="button"
          className={'analysis-session'+(item.id===activeAnalysisId?' on':'')}
          onClick={() => setActiveAnalysisId(item.id)}>
          <span>{item.ticker}</span>
          <small>{item.scenarioLabel}</small>
          <ThesisBadge decision={item.finalThesis.decision} />
        </button>
      ))}
    </div>
  );
}

function AgentReport({report, tint}){
  return (
    <div className="agent-report">
      <div className="agent-report-head">
        <div className="agent-dot" style={{background:tint}}></div>
        <div>
          <div className="agent-title">{report.name}</div>
          <div className="agent-role">{report.stage} · {report.role}</div>
        </div>
        <div className="agent-confidence">{report.confidence}%</div>
      </div>
      <div className={'stance '+report.stance}>{report.stance}</div>
      <p>{report.summary}</p>
      <ul>
        {report.findings.map((finding, index) => <li key={index}>{finding}</li>)}
      </ul>
      {report.passesTo && <div className="handoff mono">Passes to {report.passesTo}</div>}
    </div>
  );
}

function FinalThesis({analysis}){
  const thesis = analysis.finalThesis;
  return (
    <div className={'final-thesis '+thesis.decision.toLowerCase()}>
      <div className="final-head">
        <div>
          <div className="label">Final Thesis</div>
          <h3>{analysis.ticker} · {analysis.scenarioLabel}</h3>
        </div>
        <ThesisBadge decision={thesis.decision} />
      </div>
      <div className="thesis-stats">
        <div><span>Confidence</span><strong>{thesis.confidence}%</strong></div>
        <div><span>Risk</span><strong>{thesis.riskLevel}</strong></div>
        <div><span>Budget</span><strong>{thesis.budgetRange}</strong></div>
        <div><span>Window</span><strong>{thesis.holdingWindow}</strong></div>
      </div>
      <p>{thesis.rationale}</p>
      <div className="thesis-columns">
        <div>
          <h4>Risk Warnings</h4>
          <ul>{thesis.riskWarnings.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </div>
        <div>
          <h4>Next Steps</h4>
          <ul>{thesis.nextSteps.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </div>
      </div>
    </div>
  );
}

function Analysis({analyses, activeAnalysisId, setActiveAnalysisId, onCreateAnalysis, agents}){
  const active = analyses.find(item => item.id===activeAnalysisId) || analyses[0];
  const tintByName = {};
  (agents || []).forEach(agent => { tintByName[agent.name] = agent.tint; });

  return (
    <div className="view-pane frame analysis-view">
      <div className="analysis-top">
        <div>
          <h2>Agent Analysis</h2>
          <div className="desc">Structured mock workflow for weekly Options thesis building.</div>
        </div>
        <div className="analysis-count mono">{analyses.length} session runs</div>
      </div>

      <LivePanel />

      <div className="analysis-layout">
        <aside className="analysis-left">
          <AnalysisForm onCreateAnalysis={onCreateAnalysis} />
          <div className="label">Session Runs</div>
          <AnalysisList analyses={analyses} activeAnalysisId={activeAnalysisId} setActiveAnalysisId={setActiveAnalysisId} />
        </aside>

        <section className="analysis-main">
          {!active && <div className="analysis-placeholder mono">Run a workflow to see the agent handoff.</div>}
          {active && (
            <>
              <FinalThesis analysis={active} />
              <div className="label">Agent Reports</div>
              <div className="agent-report-grid">
                {active.reports.map(report => (
                  <AgentReport key={report.agentId} report={report} tint={tintByName[report.name] || 'var(--green)'} />
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

Object.assign(window, { Analysis, ThesisBadge, LivePanel });
