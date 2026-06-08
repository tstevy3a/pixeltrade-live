const assert = require('node:assert/strict');
const test = require('node:test');

const {
  ANALYSIS_SCENARIOS,
  createWorkflowAnalysis,
  normalizeTicker,
} = require('../analysis-model.js');

test('normalizeTicker trims whitespace and uppercases ticker symbols', () => {
  assert.equal(normalizeTicker(' nvda '), 'NVDA');
});

test('createWorkflowAnalysis builds the six-agent workflow in handoff order', () => {
  const analysis = createWorkflowAnalysis({
    ticker: 'nvda',
    scenarioId: 'momentum_breakout',
    id: 'analysis-test',
    now: '2026-05-30T12:00:00.000Z',
  });

  assert.equal(analysis.id, 'analysis-test');
  assert.equal(analysis.ticker, 'NVDA');
  assert.equal(analysis.scenarioLabel, 'Momentum Breakout');
  assert.deepEqual(
    analysis.reports.map((report) => report.name),
    ['Pip', 'Iris', 'Mara', 'Dex', 'Otis', 'Fern'],
  );
  assert.equal(analysis.reports.length, 6);
  assert.ok(['CALL', 'PUT', 'WAIT'].includes(analysis.finalThesis.decision));
  assert.equal(analysis.finalThesis.budgetRange, '$50-$200');
  assert.equal(analysis.finalThesis.holdingWindow, '<= 15 days');
});

test('high-risk earnings volatility can block the trade into WAIT', () => {
  const analysis = createWorkflowAnalysis({
    ticker: 'TSLA',
    scenarioId: 'earnings_volatility',
    id: 'analysis-risk',
    now: '2026-05-30T12:00:00.000Z',
  });

  assert.equal(analysis.finalThesis.decision, 'WAIT');
  assert.equal(analysis.finalThesis.riskLevel, 'High');
  assert.ok(analysis.finalThesis.riskWarnings.some((warning) => warning.includes('IV')));
});

test('scenario catalog contains the planned market-condition choices', () => {
  assert.deepEqual(
    ANALYSIS_SCENARIOS.map((scenario) => scenario.id),
    ['momentum_breakout', 'earnings_volatility', 'pullback_reversal', 'bearish_breakdown'],
  );
});
