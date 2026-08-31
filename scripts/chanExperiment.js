/* Real-data experiments for chan algorithm review. Read-only with respect to src. */
const fs = require('fs');
const path = require('path');
const {
  mergeIncludedBars,
  detectChanFractals,
  buildChanStrokes,
  findChanCenters,
  detectChanSignals,
  CHAN_ALGORITHM_VERSION,
} = require('../out/chan/engine');
const {
  parseChanValidationDatasets,
  evaluateChanSignals,
  evaluateUpsideOpportunities,
  buildChanMetrics,
  normalizeChanBacktestOptions,
} = require('../out/chan/validation');

const STRENGTH_RATIO = 0.85;
const AMPLITUDE_RATIO = 0.5;
const STABLE_FIELDS = [
  'side',
  'level',
  'variant',
  'time',
  'price',
  'strokeIndex',
  'confirmedIndex',
  'confirmedTime',
  'reason',
  'algorithmVersion',
];

function strokeStrength(s) {
  return s.amplitude / s.span;
}

function guardConfirmation(guard) {
  return guard
    ? {
        index: guard.end.firstConfirmedIndex,
        time: guard.end.firstConfirmedTime,
      }
    : undefined;
}

function makeSignal(stroke, confirmation, side, level, reason, extra) {
  return {
    id: `${stroke.end.time}:${side}:${level}`,
    side,
    level,
    variant: 'standard',
    time: stroke.end.time,
    price: stroke.end.price,
    strokeIndex: stroke.index,
    confirmedIndex: confirmation.index,
    confirmedTime: confirmation.time,
    reason,
    algorithmVersion: CHAN_ALGORITHM_VERSION,
    ...extra,
  };
}

function overlapCenters(strokes) {
  const centers = [];
  let cursor = 0;
  while (cursor <= strokes.length - 3) {
    const window = strokes.slice(cursor, cursor + 3);
    const low = Math.max(...window.map((s) => s.low));
    const high = Math.min(...window.map((s) => s.high));
    if (low >= high) {
      cursor += 1;
      continue;
    }
    let end = cursor + 2;
    while (end + 1 < strokes.length) {
      const next = strokes[end + 1];
      if (!(next.low <= high && next.high >= low)) break;
      end += 1;
    }
    centers.push({
      index: centers.length,
      startStrokeIndex: cursor,
      endStrokeIndex: end,
      low,
      high,
    });
    cursor = end + 1;
  }
  return centers;
}

function detectVariantSignals(strokes, centers, localSignals, opts) {
  const signals = [];
  if (strokes.length >= 4) {
    const stableLastIndex = strokes.length - 2;
    for (let index = 2; index <= stableLastIndex; index += 1) {
      const current = strokes[index];
      const previous = strokes[index - 2];
      const guard = strokes[index + 1];
      let center;
      for (let ci = centers.length - 1; ci >= 0; ci -= 1) {
        if (centers[ci].endStrokeIndex < index) {
          center = centers[ci];
          break;
        }
      }
      if (!center || current.direction !== previous.direction) continue;
      const offset = index - center.endStrokeIndex;
      if (offset > 3) continue;
      if (opts.firstMode === 'strict3' && offset !== 3) continue;
      if (opts.firstMode === 'drop1' && offset === 1) continue;
      const weaker =
        strokeStrength(current) < strokeStrength(previous) * STRENGTH_RATIO;
      const meaningful =
        current.amplitude >= previous.amplitude * AMPLITUDE_RATIO;
      if (!weaker || !meaningful) continue;
      const confirmation = guardConfirmation(guard);
      if (!confirmation) continue;
      if (
        current.direction === 'down' &&
        current.end.price < previous.end.price &&
        current.end.price < center.low
      ) {
        signals.push(
          makeSignal(current, confirmation, 'buy', 1, 'variant-first', {
            _offset: offset,
          })
        );
      }
      if (
        current.direction === 'up' &&
        current.end.price > previous.end.price &&
        current.end.price > center.high
      ) {
        signals.push(
          makeSignal(current, confirmation, 'sell', 1, 'variant-first', {
            _offset: offset,
          })
        );
      }
    }

    signals
      .filter((s) => s.level === 1)
      .forEach((first) => {
        const candidateIndex = first.strokeIndex + 2;
        if (candidateIndex > stableLastIndex) return;
        const candidate = strokes[candidateIndex];
        const guard = strokes[candidateIndex + 1];
        const confirmation = guardConfirmation(guard);
        if (!confirmation) return;
        const holds =
          first.side === 'buy'
            ? candidate.direction === 'down' &&
              candidate.end.price > first.price
            : candidate.direction === 'up' && candidate.end.price < first.price;
        if (!holds) return;
        signals.push(
          makeSignal(
            candidate,
            confirmation,
            first.side,
            2,
            first.side === 'buy' ? '一买后回抽不创新低' : '一卖后回抽不创新高'
          )
        );
      });

    centers.forEach((center) => {
      const exitIndex = center.endStrokeIndex + 1;
      const retestIndex = exitIndex + 1;
      if (retestIndex > stableLastIndex) return;
      const exit = strokes[exitIndex];
      const retest = strokes[retestIndex];
      const guard = strokes[retestIndex + 1];
      const confirmation = guardConfirmation(guard);
      if (!confirmation) return;
      if (
        exit.direction === 'up' &&
        exit.end.price > center.high &&
        retest.direction === 'down'
      ) {
        const pierce = retest.low <= center.high;
        if (opts.thirdMode === 'strict' && pierce) return;
        signals.push(
          makeSignal(retest, confirmation, 'buy', 3, 'variant-third', {
            _pierce: pierce,
          })
        );
      }
      if (
        exit.direction === 'down' &&
        exit.end.price < center.low &&
        retest.direction === 'up'
      ) {
        const pierce = retest.high >= center.low;
        if (opts.thirdMode === 'strict' && pierce) return;
        signals.push(
          makeSignal(retest, confirmation, 'sell', 3, 'variant-third', {
            _pierce: pierce,
          })
        );
      }
    });
  }

  const dedup = new Map();
  [...signals, ...localSignals].forEach((signal) => {
    const key = `${signal.time}:${signal.side}:${signal.level}`;
    const existing = dedup.get(key);
    if (!existing || signal.confirmedIndex < existing.confirmedIndex)
      dedup.set(key, signal);
  });
  return [...dedup.values()].sort(
    (l, r) => l.confirmedIndex - r.confirmedIndex || l.level - r.level
  );
}

function analyzeVariant(points, period, opts) {
  const merged = mergeIncludedBars(points);
  const fractals = detectChanFractals(merged);
  const strokes = buildChanStrokes(fractals);
  const stable = strokes.length > 1 ? strokes.slice(0, -1) : [];
  const centers =
    opts.centerMode === 'overlap'
      ? overlapCenters(stable)
      : findChanCenters(stable);
  const local = detectChanSignals(
    strokes,
    findChanCenters(stable),
    points,
    period
  ).filter((s) => s.variant !== 'standard');
  return detectVariantSignals(strokes, centers, local, opts);
}

function replayVariant(points, period, opts) {
  const observed = new Map();
  const violations = [];
  const vKeys = new Set();
  const addViolation = (signal, kind, index, fields) => {
    const key = `${signal.id}:${kind}`;
    if (vKeys.has(key)) return;
    vKeys.add(key);
    violations.push({
      signalId: signal.id,
      kind,
      firstSeenIndex: signal.firstSeenIndex,
      checkedAtIndex: index,
      changedFields: fields,
    });
  };
  points.forEach((_point, index) => {
    const current = analyzeVariant(points.slice(0, index + 1), period, opts);
    const byId = new Map(current.map((s) => [s.id, s]));
    current.forEach((signal) => {
      const seen = observed.get(signal.id);
      if (!seen) {
        const replay = {
          ...signal,
          firstSeenIndex: index,
          firstSeenTime: points[index].time,
          confirmationLagBars: index - signal.confirmedIndex,
        };
        observed.set(signal.id, replay);
        if (signal.confirmedIndex > index)
          addViolation(replay, 'future-confirmation', index);
        return;
      }
      const changed = STABLE_FIELDS.filter((f) => seen[f] !== signal[f]);
      if (changed.length) addViolation(seen, 'mutated', index, changed);
    });
    observed.forEach((signal) => {
      if (signal.firstSeenIndex < index && !byId.has(signal.id))
        addViolation(signal, 'missing', index);
    });
  });
  return {
    algorithmVersion: CHAN_ALGORITHM_VERSION,
    barCount: points.length,
    signals: [...observed.values()].sort(
      (l, r) => l.firstSeenIndex - r.firstSeenIndex
    ),
    stabilityViolations: violations,
  };
}

function fmt(value, digits = 4) {
  if (value === null || value === undefined) return '-';
  return (value * 100).toFixed(digits - 2);
}

function metricLine(metrics, side, level, horizon, sampleTrades) {
  const m = metrics.find(
    (x) => x.side === side && x.level === level && x.horizon === horizon
  );
  if (!m) return `${side}:${level} h${horizon}: no metric`;
  return `${side === 'all' ? 'all' : side + level} h${horizon}: n=${String(
    m.tradeCount
  ).padStart(4)} win=${fmt(m.winRate, 3)}% avg=${fmt(
    m.averageReturn
  )}% med=${fmt(m.medianReturn)}% PF=${
    m.profitFactor === null ? '-' : m.profitFactor.toFixed(2)
  } dd=${fmt(m.maxDrawdown)}%`;
}

function runVariant(name, datasets, options, opts) {
  const allTrades = [];
  const allOpportunities = [];
  let violations = 0;
  const signalCounts = {
    standard: { 1: 0, 2: 0, 3: 0 },
    'local-divergence': 0,
    'local-second': 0,
  };
  const tagBuckets = {};
  datasets.forEach((dataset) => {
    const replay = replayVariant(dataset.points, dataset.period, opts);
    violations += replay.stabilityViolations.length;
    replay.signals.forEach((s) => {
      if (s.variant === 'standard') signalCounts.standard[s.level] += 1;
      else signalCounts[s.variant] += 1;
      const tag =
        s._offset !== undefined
          ? `offset${s._offset}`
          : s._pierce !== undefined
          ? `pierce${s._pierce}`
          : '';
      if (tag) tagBuckets[tag] = (tagBuckets[tag] || 0) + 1;
    });
    const trades = evaluateChanSignals(dataset, replay, options);
    trades.forEach((t) => {
      t._tag =
        replay.signals.find((s) => s.id === t.signalId)?._offset !== undefined
          ? `offset${replay.signals.find((s) => s.id === t.signalId)._offset}`
          : replay.signals.find((s) => s.id === t.signalId)?._pierce !==
            undefined
          ? `pierce${replay.signals.find((s) => s.id === t.signalId)._pierce}`
          : '';
    });
    allTrades.push(...trades);
    allOpportunities.push(
      ...evaluateUpsideOpportunities(dataset, replay, options)
    );
  });
  const holdout = allTrades.filter((t) => t.sample === 'holdout');
  const dev = allTrades.filter((t) => t.sample === 'development');
  const metrics = buildChanMetrics(holdout, options.horizons);
  const coveredHoldout = allOpportunities.filter((o) => o.sample === 'holdout');
  const coverage = coveredHoldout.length
    ? coveredHoldout.filter((o) => o.covered).length / coveredHoldout.length
    : null;
  return {
    name,
    trades: allTrades,
    holdout,
    dev,
    metrics,
    violations,
    signalCounts,
    tagBuckets,
    coverage,
    opportunities: coveredHoldout,
  };
}

function printVariant(result) {
  console.log(`\n=== ${result.name} ===`);
  console.log(
    `signals: standard L1=${result.signalCounts.standard[1]} L2=${result.signalCounts.standard[2]} L3=${result.signalCounts.standard[3]}, local-div=${result.signalCounts['local-divergence']}, local-2nd=${result.signalCounts['local-second']}; violations=${result.violations}`
  );
  console.log(
    `tags: ${
      Object.entries(result.tagBuckets)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ') || '-'
    }`
  );
  console.log(
    `trades: dev=${result.dev.length} holdout=${
      result.dev ? result.holdout.length : 0
    }; holdout opportunity coverage=${
      result.coverage === null ? '-' : (result.coverage * 100).toFixed(1) + '%'
    }`
  );
  [10, 20].forEach((h) => {
    console.log(`  [h${h} holdout]`);
    [
      'all',
      ['buy', 1],
      ['sell', 1],
      ['buy', 2],
      ['sell', 2],
      ['buy', 3],
      ['sell', 3],
    ].forEach((key) => {
      const side = key === 'all' ? 'all' : key[0];
      const level = key === 'all' ? 'all' : key[1];
      console.log('   ' + metricLine(result.metrics, side, level, h));
    });
  });
}

function serialDrawdown(trades) {
  let equity = 1;
  let peak = 1;
  let maxDD = 0;
  trades.forEach((t) => {
    equity *= Math.max(0, 1 + t.netReturn);
    peak = Math.max(peak, equity);
    maxDD = Math.max(maxDD, peak ? 1 - equity / peak : 1);
  });
  return maxDD;
}

const inputPath = path.resolve(
  process.argv[2] || './.chan-validation/expanded-input.json'
);
const datasets = parseChanValidationDatasets(
  JSON.parse(fs.readFileSync(inputPath, 'utf8'))
);
const options = normalizeChanBacktestOptions({});
console.log(
  `datasets=${datasets.length}, bars=${datasets.reduce(
    (n, d) => n + d.points.length,
    0
  )}`
);

const variants = [
  [
    'baseline',
    { firstMode: 'loose', thirdMode: 'loose', centerMode: 'endpoint' },
  ],
  [
    'dropOffset1(keep offset 2/3)',
    { firstMode: 'drop1', thirdMode: 'loose', centerMode: 'endpoint' },
  ],
  [
    'strictFirst(offset=3 only)',
    { firstMode: 'strict3', thirdMode: 'loose', centerMode: 'endpoint' },
  ],
  [
    'strictThird(whole stroke outside)',
    { firstMode: 'loose', thirdMode: 'strict', centerMode: 'endpoint' },
  ],
  [
    'dropOffset1+strictThird',
    { firstMode: 'drop1', thirdMode: 'strict', centerMode: 'endpoint' },
  ],
  [
    'overlapCenters(extension by overlap)',
    { firstMode: 'loose', thirdMode: 'loose', centerMode: 'overlap' },
  ],
  [
    'combined(strictFirst+strictThird+overlap)',
    { firstMode: 'strict3', thirdMode: 'strict', centerMode: 'overlap' },
  ],
];

const results = variants.map(([name, opts]) => {
  const r = runVariant(name, datasets, options, opts);
  printVariant(r);
  return r;
});

// --- 4.1 drawdown口径: baseline holdout, global cross-symbol vs per-(symbol,period) serial
const base = results[0];
console.log('\n=== drawdown methodology (baseline, holdout, h10) ===');
const h10 = base.holdout.filter((t) => t.horizon === 10);
console.log(
  `global cross-symbol serial DD (current report): ${(
    serialDrawdown(h10) * 100
  ).toFixed(2)}%`
);
const groups = new Map();
h10.forEach((t) => {
  const key = `${t.symbol}|${t.period}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(t);
});
const dds = [...groups.values()].map((trades) => serialDrawdown(trades));
const avgDD = dds.reduce((a, b) => a + b, 0) / dds.length;
const maxDD = Math.max(...dds);
console.log(
  `per-(symbol,period) serial DD: avg=${(avgDD * 100).toFixed(2)}%, worst=${(
    maxDD * 100
  ).toFixed(2)}%, groups=${dds.length}`
);

// --- tag performance on baseline holdout (offset buckets for L1, pierce buckets for L3)
console.log('\n=== baseline tag performance (holdout) ===');
['offset1', 'offset2', 'offset3', 'piercetrue', 'piercefalse'].forEach(
  (tag) => {
    [10, 20].forEach((h) => {
      const trades = base.holdout.filter(
        (t) => t.horizon === h && t._tag === tag
      );
      if (!trades.length) {
        console.log(`${tag} h${h}: n=0`);
        return;
      }
      const wins = trades.filter((t) => t.netReturn > 0).length;
      const avg = trades.reduce((a, t) => a + t.netReturn, 0) / trades.length;
      const gp = trades
        .filter((t) => t.netReturn > 0)
        .reduce((a, t) => a + t.netReturn, 0);
      const gl = Math.abs(
        trades
          .filter((t) => t.netReturn < 0)
          .reduce((a, t) => a + t.netReturn, 0)
      );
      console.log(
        `${tag} h${h}: n=${String(trades.length).padStart(3)} win=${(
          (wins / trades.length) *
          100
        ).toFixed(1)}% avg=${(avg * 100).toFixed(2)}% PF=${
          gl ? (gp / gl).toFixed(2) : 'inf'
        }`
      );
    });
  }
);

const out = {
  variants: results.map((r) => ({
    name: r.name,
    signalCounts: r.signalCounts,
    violations: r.violations,
    tagBuckets: r.tagBuckets,
    coverage: r.coverage,
    holdoutMetrics: r.metrics,
  })),
  drawdown: {
    globalCrossSymbolH10: serialDrawdown(h10),
    perSymbolAvgH10: avgDD,
    perSymbolWorstH10: maxDD,
  },
};
fs.writeFileSync(
  path.resolve('./.chan-validation/experiment-report.json'),
  JSON.stringify(out, null, 2)
);
console.log('\nwrote ./.chan-validation/experiment-report.json');
