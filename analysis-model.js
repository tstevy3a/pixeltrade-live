/* ===== Analysis workflow model: structured mock agent handoffs ===== */

(function(root){
  const ANALYSIS_SCENARIOS = [
    {
      id: 'momentum_breakout',
      label: 'Momentum Breakout',
      stance: 'bullish',
      baseDecision: 'CALL',
      riskLevel: 'Medium',
      setup: 'price is pressing through a clean resistance zone with expanding momentum',
      catalyst: 'short-term flow supports continuation if volume holds',
      optionsNote: 'near-the-money calls keep the thesis simple while limiting premium stretch',
      dataQuality: 'price and options snapshots align cleanly',
      confidence: 68,
      riskWarnings: [
        'Breakouts can fail quickly if volume fades after entry.',
        'Premium decay matters if the move stalls for more than two sessions.',
      ],
    },
    {
      id: 'earnings_volatility',
      label: 'Earnings Volatility',
      stance: 'mixed',
      baseDecision: 'CALL',
      riskLevel: 'High',
      setup: 'earnings timing can create a sharp move, but direction quality is not confirmed',
      catalyst: 'event risk is high and implied volatility is elevated',
      optionsNote: 'contracts price in a large move, so the setup needs unusually strong conviction',
      dataQuality: 'news flow is mixed and IV crush risk is material',
      confidence: 54,
      blockTrade: true,
      riskWarnings: [
        'IV is elevated before the event and can crush premium after the announcement.',
        'Direction risk is too high without a stronger edge.',
      ],
    },
    {
      id: 'pullback_reversal',
      label: 'Pullback Reversal',
      stance: 'bullish',
      baseDecision: 'CALL',
      riskLevel: 'Medium',
      setup: 'price is pulling back into a prior support area after a stronger trend',
      catalyst: 'a bounce is possible if buyers defend the support zone',
      optionsNote: 'calls need confirmation because sideways action can drain premium',
      dataQuality: 'trend context is useful but reversal confirmation is still early',
      confidence: 62,
      riskWarnings: [
        'A support break invalidates the reversal thesis.',
        'Entering before confirmation increases theta risk.',
      ],
    },
    {
      id: 'bearish_breakdown',
      label: 'Bearish Breakdown',
      stance: 'bearish',
      baseDecision: 'PUT',
      riskLevel: 'Medium',
      setup: 'price is losing support and sellers are controlling the tape',
      catalyst: 'weak momentum can accelerate if the breakdown confirms',
      optionsNote: 'near-the-money puts fit the direction, but entry quality still matters',
      dataQuality: 'price action and risk signals point in the same direction',
      confidence: 66,
      riskWarnings: [
        'A fast reclaim of support can trap late put entries.',
        'Put premiums can expand quickly after the first breakdown candle.',
      ],
    },
  ];

  const AGENT_STAGES = [
    {agentId:'a1', name:'Pip',  role:'Lead Market Analyst',      stage:'Market Setup',        passesTo:'Iris'},
    {agentId:'a4', name:'Iris', role:'Research Analyst',         stage:'Catalyst Check',      passesTo:'Mara'},
    {agentId:'a2', name:'Mara', role:'Options Quant Strategist', stage:'Options Structure',   passesTo:'Dex'},
    {agentId:'a3', name:'Dex',  role:'Risk Manager',             stage:'Risk Gate',           passesTo:'Otis'},
    {agentId:'a5', name:'Otis', role:'Data/API Operator',        stage:'Data Quality',        passesTo:'Fern'},
    {agentId:'a6', name:'Fern', role:'Signal & Memory Auditor',  stage:'Final Audit',         passesTo:null},
  ];

  const findScenario = (scenarioId) =>
    ANALYSIS_SCENARIOS.find((scenario) => scenario.id === scenarioId) || ANALYSIS_SCENARIOS[0];

  function normalizeTicker(value){
    return String(value || '').trim().toUpperCase();
  }

  function stanceFor(stage, scenario){
    if(stage.name === 'Dex' && scenario.riskLevel === 'High') return 'defensive';
    if(stage.name === 'Otis' && scenario.dataQuality.includes('mixed')) return 'cautious';
    if(stage.name === 'Fern' && scenario.blockTrade) return 'wait';
    return scenario.stance;
  }

  function reportFor(stage, ticker, scenario){
    const confidenceShift = {
      Pip: 4,
      Iris: scenario.riskLevel === 'High' ? -4 : 0,
      Mara: scenario.riskLevel === 'High' ? -6 : 2,
      Dex: scenario.riskLevel === 'High' ? -10 : -2,
      Otis: scenario.dataQuality.includes('mixed') ? -7 : 1,
      Fern: scenario.blockTrade ? -8 : 0,
    }[stage.name] || 0;
    const confidence = Math.max(35, Math.min(88, scenario.confidence + confidenceShift));

    const copy = {
      Pip: {
        summary: `${ticker} setup shows ${scenario.setup}.`,
        findings: [
          `Primary stance is ${scenario.stance}.`,
          'The market setup is passed forward before contract selection.',
        ],
      },
      Iris: {
        summary: `Catalyst read: ${scenario.catalyst}.`,
        findings: [
          'News and event timing are treated as thesis inputs, not final decisions.',
          scenario.riskLevel === 'High' ? 'Event risk needs a stricter risk gate.' : 'Catalyst quality is acceptable for a mock workflow pass.',
        ],
      },
      Mara: {
        summary: `Options structure: ${scenario.optionsNote}.`,
        findings: [
          'Budget range remains $50-$200 for the candidate idea.',
          'Holding window stays inside <= 15 days.',
        ],
      },
      Dex: {
        summary: scenario.blockTrade
          ? 'Risk gate blocks the trade until premium and direction risk improve.'
          : 'Risk gate allows the thesis to continue with controlled sizing.',
        findings: [
          `Risk level is ${scenario.riskLevel}.`,
          scenario.riskWarnings[0],
        ],
      },
      Otis: {
        summary: `Data check: ${scenario.dataQuality}.`,
        findings: [
          'Data is structured as mock input and must not be treated as live market data.',
          scenario.dataQuality.includes('mixed') ? 'Conflicting context lowers final confidence.' : 'Inputs are consistent enough for a paper workflow result.',
        ],
      },
      Fern: {
        summary: scenario.blockTrade
          ? 'Final audit recommends WAIT because the team has risk disagreement.'
          : `Final audit supports a ${scenario.baseDecision} thesis if execution quality is disciplined.`,
        findings: [
          'Agent handoffs are complete and ready to be journaled later.',
          scenario.blockTrade ? 'The strongest signal is risk avoidance.' : 'The strongest signal is alignment across market, catalyst, and risk checks.',
        ],
      },
    }[stage.name];

    return {
      agentId: stage.agentId,
      name: stage.name,
      role: stage.role,
      stage: stage.stage,
      stance: stanceFor(stage, scenario),
      confidence,
      summary: copy.summary,
      findings: copy.findings,
      passesTo: stage.passesTo,
    };
  }

  function buildFinalThesis(ticker, scenario, reports){
    const decision = scenario.blockTrade ? 'WAIT' : scenario.baseDecision;
    const confidencePenalty = scenario.blockTrade ? 10 : 0;
    const avgConfidence = Math.round(
      reports.reduce((sum, report) => sum + report.confidence, 0) / reports.length,
    );

    return {
      decision,
      confidence: Math.max(35, avgConfidence - confidencePenalty),
      riskLevel: scenario.riskLevel,
      budgetRange: '$50-$200',
      holdingWindow: '<= 15 days',
      rationale: decision === 'WAIT'
        ? `${ticker} has a possible setup, but the current ${scenario.label} context does not offer enough edge after risk review.`
        : `${ticker} produces a structured ${decision} thesis from the ${scenario.label} scenario, with risk controls still required before any real trade.`,
      riskWarnings: scenario.riskWarnings,
      nextSteps: decision === 'WAIT'
        ? ['Wait for cleaner data or a better entry.', 'Re-run the workflow after the event or volatility cools.']
        : ['Paper trade the thesis before using real money.', 'Record entry assumptions so Fern can audit the result later.'],
    };
  }

  function createWorkflowAnalysis({ticker, scenarioId, id, now}){
    const normalizedTicker = normalizeTicker(ticker);
    const scenario = findScenario(scenarioId);
    const reports = AGENT_STAGES.map((stage) => reportFor(stage, normalizedTicker, scenario));

    return {
      id: id || `analysis-${Date.now()}`,
      createdAt: now || new Date().toISOString(),
      ticker: normalizedTicker,
      scenarioId: scenario.id,
      scenarioLabel: scenario.label,
      reports,
      finalThesis: buildFinalThesis(normalizedTicker, scenario, reports),
    };
  }

  const api = {
    ANALYSIS_SCENARIOS,
    createWorkflowAnalysis,
    normalizeTicker,
  };

  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AnalysisModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
