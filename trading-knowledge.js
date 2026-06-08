/* ===== Trading Knowledge Base =====
   Knowledge extracted from TauricResearch/TradingAgents framework,
   adapted for PixelTrade's browser-side decision engine.

   Provides:
   - 5-tier rating system (Buy/Overweight/Hold/Underweight/Sell)
   - 13 indicators with descriptions and usage tips
   - Bull/Bear debate heuristics (no LLM, rule-based)
   - Risk profiles (aggressive/conservative/neutral)
   - Sentiment analysis rules (cross-source divergence)
   - Position sizing + stop loss guidance
   - Multi-asset support (stocks vs crypto)

   Used by:
   - hyperliquid-data.js: crypto team decideAction()
   - live-data.js: stocks team indicator-aware outcomes
   - Future: Analysis view + LLM fallback prompts */

(function(){

  // === 13 indicators with descriptions ===
  const INDICATORS = {
    close_50_sma: {
      name: '50 SMA', kind: 'moving_avg',
      desc: 'Medium-term trend. Identify trend direction; dynamic support/resistance.',
      tips: 'Lags price. Combine with faster indicators for timely signals.',
      use: 'medium_term_trend'
    },
    close_200_sma: {
      name: '200 SMA', kind: 'moving_avg',
      desc: 'Long-term trend benchmark. Confirm overall market trend, golden/death cross.',
      tips: 'Reacts slowly. Best for strategic trend confirmation.',
      use: 'long_term_trend'
    },
    close_10_ema: {
      name: '10 EMA', kind: 'moving_avg',
      desc: 'Responsive short-term average. Capture quick shifts, entry points.',
      tips: 'Prone to noise in choppy markets. Use with longer averages.',
      use: 'short_term_momentum'
    },
    macd: {
      name: 'MACD', kind: 'momentum',
      desc: 'Momentum via EMA differences. Crossovers and divergence.',
      tips: 'Confirm with other indicators in low-volatility or sideways markets.',
      use: 'momentum'
    },
    macds: {
      name: 'MACD Signal', kind: 'momentum',
      desc: 'EMA smoothing of MACD line. Crossovers trigger trades.',
      tips: 'Should be part of broader strategy to avoid false positives.',
      use: 'signal_line'
    },
    macdh: {
      name: 'MACD Histogram', kind: 'momentum',
      desc: 'Gap between MACD and signal. Visualize momentum strength, divergence.',
      tips: 'Can be volatile. Complement with additional filters in fast-moving markets.',
      use: 'momentum_strength'
    },
    rsi: {
      name: 'RSI', kind: 'momentum',
      desc: 'Overbought (>=70) / oversold (<=30). Watch divergence for reversals.',
      tips: 'In strong trends, RSI may stay extreme. Cross-check with trend.',
      use: 'overbought_oversold'
    },
    boll: {
      name: 'Bollinger Middle', kind: 'volatility',
      desc: '20 SMA basis. Dynamic benchmark for price movement.',
      tips: 'Combine with upper/lower bands for breakouts or reversals.',
      use: 'baseline'
    },
    boll_ub: {
      name: 'Bollinger Upper Band', kind: 'volatility',
      desc: '2 std dev above middle. Overbought, breakout zones.',
      tips: 'Confirm with other tools; prices may ride band in strong trends.',
      use: 'overbought_breakout'
    },
    boll_lb: {
      name: 'Bollinger Lower Band', kind: 'volatility',
      desc: '2 std dev below middle. Oversold.',
      tips: 'Use additional analysis to avoid false reversal signals.',
      use: 'oversold'
    },
    atr: {
      name: 'ATR', kind: 'volatility',
      desc: 'Average True Range. Set stop-loss, adjust position size to volatility.',
      tips: 'Reactive measure. Part of broader risk management.',
      use: 'position_sizing'
    },
    vwma: {
      name: 'VWMA', kind: 'volume',
      desc: 'Volume-weighted MA. Confirm trends with price + volume.',
      tips: 'Watch for skewed results from volume spikes.',
      use: 'volume_confirmation'
    },
    funding: {  // Crypto-specific
      name: 'Funding Rate', kind: 'crypto',
      desc: 'Periodic payment between long/short perp holders. Positive = longs pay shorts.',
      tips: 'Extreme funding = potential reversal. 0% funding = neutral market.',
      use: 'sentiment_crypto'
    },
  };

  // === 5-tier rating ===
  const RATINGS = {
    BUY: {value: 5, label: 'Buy', action: 'strong_buy', desc: 'Strong conviction to enter or add to position'},
    OVERWEIGHT: {value: 4, label: 'Overweight', action: 'buy', desc: 'Favorable outlook, gradually increase exposure'},
    HOLD: {value: 3, label: 'Hold', action: 'hold', desc: 'Maintain current position, no action needed'},
    UNDERWEIGHT: {value: 2, label: 'Underweight', action: 'sell', desc: 'Reduce exposure, take partial profits'},
    SELL: {value: 1, label: 'Sell', action: 'strong_sell', desc: 'Exit position or avoid entry'},
  };

  // === Sentiment band (6 tiers) ===
  const SENTIMENT_BANDS = {
    BULLISH: {label: 'Bullish', score: 8.0, action: 'long'},
    MILDLY_BULLISH: {label: 'Mildly Bullish', score: 6.0, action: 'mild_long'},
    NEUTRAL: {label: 'Neutral', score: 5.0, action: 'hold'},
    MIXED: {label: 'Mixed', score: 5.0, action: 'hold'},
    MILDLY_BEARISH: {label: 'Mildly Bearish', score: 4.0, action: 'mild_short'},
    BEARISH: {label: 'Bearish', score: 2.0, action: 'short'},
  };

  // === Risk profiles ===
  const RISK_PROFILES = {
    aggressive: {
      risk_per_trade: 0.02,  // 2%
      max_position_size: 0.20,  // 20% of portfolio
      stop_loss_atr_multiplier: 1.5,
      take_profit_atr_multiplier: 4.0,
      max_hold_time: '1-2 weeks',
      favors: 'high momentum, breakout, growth'
    },
    neutral: {
      risk_per_trade: 0.01,  // 1%
      max_position_size: 0.10,
      stop_loss_atr_multiplier: 2.0,
      take_profit_atr_multiplier: 3.0,
      max_hold_time: '2-4 weeks',
      favors: 'balanced, mean-reversion + momentum'
    },
    conservative: {
      risk_per_trade: 0.005,  // 0.5%
      max_position_size: 0.05,
      stop_loss_atr_multiplier: 2.5,
      take_profit_atr_multiplier: 2.0,
      max_hold_time: '1-3 months',
      favors: 'value, oversold bounces, hedging'
    }
  };

  // === Bull/Bear debate heuristics (rule-based, no LLM) ===

  // Bull case: build evidence for going long
  function buildBullCase(indicators, assetType = 'crypto') {
    const reasons = [];
    let score = 0;
    const {rsi, macd, bollinger, atr, price} = indicators;

    // RSI: oversold = bullish (mean reversion)
    if (rsi != null && rsi < 35) { reasons.push(`RSI ${rsi.toFixed(0)}: oversold zone, mean reversion bounce likely`); score += 1.0; }
    else if (rsi != null && rsi < 45) { reasons.push(`RSI ${rsi.toFixed(0)}: approaching oversold`); score += 0.5; }

    // MACD: bullish crossover or histogram positive
    if (macd && macd.trend === 'bullish') { reasons.push(`MACD bullish: momentum confirmed`); score += 1.0; }
    if (macd && macd.histogram > 0 && macd.trend === 'bullish') { reasons.push(`MACD histogram positive: accelerating bullish`); score += 0.5; }

    // Bollinger: below lower band = buy
    if (bollinger && price < bollinger.lower) { reasons.push(`Price below lower BB: oversold, mean reversion expected`); score += 1.0; }

    // Crypto-specific: negative funding = shorts paying longs
    if (assetType === 'crypto' && indicators.funding != null && indicators.funding < -0.01) {
      reasons.push(`Funding rate ${indicators.funding}%: shorts paying longs, bullish`); score += 0.5;
    }

    // Squeeze + bullish trend = breakout
    if (bollinger && bollinger.bandwidth < 0.02 && macd && macd.trend === 'bullish') {
      reasons.push(`BB squeeze + MACD bullish: breakout setup`); score += 0.5;
    }

    return {score, reasons, side: 'bull'};
  }

  // Bear case: build evidence for going short
  function buildBearCase(indicators, assetType = 'crypto') {
    const reasons = [];
    let score = 0;
    const {rsi, macd, bollinger, atr, price} = indicators;

    // RSI: overbought = bearish
    if (rsi != null && rsi > 65) { reasons.push(`RSI ${rsi.toFixed(0)}: overbought zone, reversal risk`); score += 1.0; }
    else if (rsi != null && rsi > 55) { reasons.push(`RSI ${rsi.toFixed(0)}: elevated`); score += 0.3; }

    // MACD: bearish
    if (macd && macd.trend === 'bearish') { reasons.push(`MACD bearish: momentum negative`); score += 1.0; }
    if (macd && macd.histogram < 0 && macd.trend === 'bearish') { reasons.push(`MACD histogram negative: bearish acceleration`); score += 0.5; }

    // Bollinger: above upper band = overbought
    if (bollinger && price > bollinger.upper) { reasons.push(`Price above upper BB: overbought`); score += 1.0; }

    // High volatility = risk
    if (atr && bollinger && bollinger.bandwidth > 0.10) {
      reasons.push(`High volatility (bw=${bollinger.bandwidth.toFixed(3)}): risk elevated`); score += 0.5;
    }

    // Crypto: positive funding = longs over-leveraged
    if (assetType === 'crypto' && indicators.funding != null && indicators.funding > 0.05) {
      reasons.push(`Funding rate ${indicators.funding}%: longs crowded, reversal risk`); score += 0.5;
    }

    return {score, reasons, side: 'bear'};
  }

  // === Debater — resolve bull vs bear into rating ===
  function resolveDebate(bull, bear) {
    const diff = bull.score - bear.score;
    let rating;
    if (diff >= 1.5) rating = 'BUY';
    else if (diff >= 0.5) rating = 'OVERWEIGHT';
    else if (diff > -0.5) rating = 'HOLD';
    else if (diff > -1.5) rating = 'UNDERWEIGHT';
    else rating = 'SELL';
    return {rating, diff, bull_score: bull.score, bear_score: bear.score};
  }

  // === Cross-source sentiment analysis ===
  // news: institutional framing (slower, fact-driven)
  // stocktwits: retail (fast, emotional)
  // reddit: community (engagement-weighted)
  function resolveSentiment(news_score, stocktwits_score, reddit_score) {
    // Each input is -1 to 1 (bearish to bullish)
    const all_scores = [news_score, stocktwits_score, reddit_score].filter(s => s != null);
    if (all_scores.length === 0) return {band: 'NEUTRAL', confidence: 'low', score: 5.0, divergences: []};

    const avg = all_scores.reduce((a,b) => a+b, 0) / all_scores.length;
    const divergence = Math.max(...all_scores) - Math.min(...all_scores);

    // Detect divergence
    const divergences = [];
    if (news_score != null && stocktwits_score != null) {
      if (Math.sign(news_score) !== Math.sign(stocktwits_score) && Math.abs(news_score - stocktwits_score) > 0.5) {
        divergences.push('news_vs_stocktwits');
      }
    }

    let band;
    if (avg >= 0.5) band = 'BULLISH';
    else if (avg >= 0.2) band = 'MILDLY_BULLISH';
    else if (avg > -0.2) band = avg > 0.05 ? 'NEUTRAL' : (avg < -0.05 ? 'MIXED' : 'NEUTRAL');
    else if (avg > -0.5) band = 'MILDLY_BEARISH';
    else band = 'BEARISH';

    // Confidence based on data quality and divergence
    let confidence = 'high';
    if (all_scores.length < 2) confidence = 'low';
    else if (all_scores.length < 3) confidence = 'medium';
    if (divergence > 1.0) confidence = 'low';
    else if (divergence > 0.7) confidence = 'medium';

    const score = 5 + (avg * 4);  // -1..+1 → 1..9
    return {band, score, confidence, divergences, raw_avg: avg};
  }

  // === Position sizing (Kelly-inspired, conservative) ===
  function computePosition(balance, entry, atr, risk_pct, max_size_pct) {
    // Risk = balance * risk_pct
    // Stop = entry - (2 * atr) for long
    // Size = risk / (entry - stop)
    const stop_distance = 2 * atr;
    if (stop_distance <= 0) return {size: 0, stop: entry, risk_usd: 0, size_pct: 0};

    const risk_usd = balance * risk_pct;
    let size = risk_usd / stop_distance;
    const notional = size * entry;
    const size_pct = notional / balance;

    if (size_pct > max_size_pct) {
      size = (balance * max_size_pct) / entry;
    }

    return {
      size,
      stop: entry - stop_distance,
      risk_usd: Math.min(risk_usd, size * stop_distance),
      size_pct: Math.min(size_pct, max_size_pct),
      notional: size * entry
    };
  }

  // === Multi-asset context ===
  function getAssetContext(symbol, assetType) {
    if (assetType === 'crypto') {
      return {
        type: 'crypto',
        label: 'asset',
        fundamentals_label: 'Asset fundamentals report (may be unavailable for crypto)',
        has_24h_volume: true,
        has_funding: true,
        has_open_interest: true,
        has_insider_data: false,
        has_balance_sheet: false,
      };
    }
    return {
      type: 'stock',
      label: 'company',
      fundamentals_label: 'Company fundamentals report',
      has_24h_volume: true,
      has_funding: false,
      has_open_interest: false,
      has_insider_data: true,
      has_balance_sheet: true,
    };
  }

  // === Lessons learned (for past_context memory) ===
  const LESSONS = [
    'In strong trends, RSI may stay extreme — do not fade the trend based on RSI alone.',
    'BB squeeze precedes breakouts — combine with MACD direction to filter direction.',
    'Funding rate > 0.1% often precedes short squeezes (longs crowded) or trend reversals.',
    'Crypto fundamentals data is sparse — lean more on technicals and sentiment than fundamentals.',
    'ATR-based stops adapt to volatility — fixed percentage stops get run over in volatile markets.',
    'When news says bearish but retail is bullish (StockTwits), the market often goes with retail first, then reverses.',
    'Engagement-weighted Reddit (upvotes + comments) is a stronger signal than post count.',
    'Stop-loss in perpetuals: 2-3x ATR is a starting point; tighten if you have low conviction.',
    'Position sizing matters more than entry timing. 1% risk per trade is the survival baseline.',
    'Past sentiment is not predictive — use as one input among many, not as a price call.',
  ];

  // === Conflict-of-interest guard ===
  // When bull + bear scores are both high, the signal is conflicted → recommend HOLD
  function resolveWithConflictGuard(bull, bear) {
    const total = bull.score + bear.score;
    const conflict = Math.min(bull.score, bear.score);
    if (conflict >= 1.0 && total >= 2.5) {
      return {rating: 'HOLD', reason: 'Conflicting signals (both bull and bear strong) — hold or wait'};
    }
    return resolveDebate(bull, bear);
  }

  // === LLM prompt template (for hybrid mode) ===
  const LLM_PROMPT_TEMPLATE = [
    'You are a {role} analyst for {symbol} ({asset_type}).',
    '',
    'Current market state:',
    '- Price: {price_str}',
    '- RSI: {rsi} (oversold <30, overbought >70)',
    '- MACD: {macd_trend}, histogram {macd_hist}',
    '- Bollinger: bandwidth {bb_bandwidth} ({bb_state})',
    '- ATR: {atr}',
    '- 24h change: {change_pct}%',
    '',
    'Bull case (score {bull_score}/3):',
    '{bull_reasons}',
    '',
    'Bear case (score {bear_score}/3):',
    '{bear_reasons}',
    '',
    'Based on these signals AND your understanding of {asset_type} markets, what is your recommendation?',
    'Respond with: BUY, OVERWEIGHT, HOLD, UNDERWEIGHT, or SELL + 1-2 sentence reasoning.'
  ].join('\n');

  // === Public API ===
  window.TradingKnowledge = {
    INDICATORS, RATINGS, SENTIMENT_BANDS, RISK_PROFILES, LESSONS,
    buildBullCase, buildBearCase, resolveDebate, resolveWithConflictGuard,
    resolveSentiment, computePosition, getAssetContext, LLM_PROMPT_TEMPLATE,
  };

  console.log('[TradingKnowledge] loaded: 13 indicators, 5 ratings, 3 risk profiles, 10 lessons');
})();
