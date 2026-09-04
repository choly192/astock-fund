import {
  analyzeChan,
  CHAN_ALGORITHM_VERSION,
  ChanAnalysisOptions,
  ChanSignal,
  ChanSignalLevel,
  ChanSignalSide,
  ChanSignalVariant,
  ChanTime,
} from './engine';
import { StockChartPeriod, StockChartPoint } from '../shared/stockChartProtocol';
import {
  ChanMarketRegime,
  classifyMarketRegime,
  DEFAULT_CHAN_MARKET_REGIME_OPTIONS,
} from './marketRegime';

export { classifyMarketRegime } from './marketRegime';
export type { ChanMarketRegime } from './marketRegime';

export const CHAN_VALIDATION_SCHEMA_VERSION = '1.4.0';

export type ChanValidationPeriod = Exclude<StockChartPeriod, 'trend'>;
export type ChanStabilityViolationKind = 'future-confirmation' | 'missing' | 'mutated';
export type ChanValidationSample = 'development' | 'holdout';
export type ChanAssetType = 'stock' | 'index' | 'etf' | 'fund' | 'unknown';
export type ChanReturnMode = 'long' | 'downside-follow-through';

export interface ChanValidationDataset {
  symbol: string;
  period: ChanValidationPeriod;
  assetType?: ChanAssetType;
  source?: string;
  points: StockChartPoint[];
}

export interface ChanReplaySignal extends ChanSignal {
  firstSeenIndex: number;
  firstSeenTime: ChanTime;
  confirmationLagBars: number;
}

export interface ChanStabilityViolation {
  signalId: string;
  kind: ChanStabilityViolationKind;
  firstSeenIndex: number;
  checkedAtIndex: number;
  checkedAtTime: ChanTime;
  changedFields?: string[];
}

export interface ChanReplayResult {
  algorithmVersion: string;
  barCount: number;
  signals: ChanReplaySignal[];
  ruleSignals: ChanReplaySignal[];
  stabilityViolations: ChanStabilityViolation[];
}

export interface ChanBacktestOptions {
  horizons: number[];
  feeBps: number;
  sellTaxBps: number;
  slippageBps: number;
  developmentRatio: number;
  regimeMaBars: number;
  regimeSlopeBars: number;
  regimeThreshold: number;
  enableTdxMultiscale: boolean;
}

export interface ChanTradeEvaluation {
  symbol: string;
  period: ChanValidationPeriod;
  assetType: ChanAssetType;
  sample: ChanValidationSample;
  regime: ChanMarketRegime;
  signalId: string;
  side: ChanSignalSide;
  returnMode: ChanReturnMode;
  executable: boolean;
  roundTripCostBps: number;
  level: ChanSignalLevel;
  variant: ChanSignalVariant;
  signalTime: ChanTime;
  confirmedTime: ChanTime;
  availableIndex: number;
  availableTime: ChanTime;
  entryIndex: number;
  entryTime: ChanTime;
  entryPrice: number;
  horizon: number;
  exitIndex: number;
  exitTime: ChanTime;
  exitPrice: number;
  grossReturn: number;
  netReturn: number;
  mfe: number;
  mae: number;
}

export interface ChanMetricSummary {
  group: string;
  side: ChanSignalSide | 'all';
  level: ChanSignalLevel | 'all';
  horizon: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: number | null;
  averageReturn: number | null;
  medianReturn: number | null;
  profitFactor: number | null;
  sequentialSignalDrawdown: number | null;
  medianDatasetSignalDrawdown: number | null;
  worstDatasetSignalDrawdown: number | null;
  averageMfe: number | null;
  averageMae: number | null;
}

export interface ChanMetricSlice extends ChanMetricSummary {
  sample: ChanValidationSample | 'all';
  period: ChanValidationPeriod | 'all';
  regime: ChanMarketRegime | 'all';
}

export interface ChanVariantMetricSummary extends ChanMetricSummary {
  variant: ChanSignalVariant;
}

export interface ChanUpsideOpportunity {
  symbol: string;
  period: ChanValidationPeriod;
  sample: ChanValidationSample;
  startIndex: number;
  startTime: ChanTime;
  startPrice: number;
  horizon: number;
  forwardReturn: number;
  covered: boolean;
  signalId?: string;
}

export interface ChanOpportunityCoverage {
  sample: ChanValidationSample | 'all';
  period: ChanValidationPeriod | 'all';
  eventCount: number;
  coveredCount: number;
  coverageRate: number | null;
}

export interface ChanVariantOpportunityCoverage extends ChanOpportunityCoverage {
  variant: ChanSignalVariant;
}

export interface ChanOpportunitySensitivity {
  thresholdAdjustment: number;
  signalWindow: number;
  coverage: ChanOpportunityCoverage[];
}

export interface ChanRuleDiagnostic {
  side: ChanSignalSide;
  level: ChanSignalLevel;
  horizon: number;
  development: ChanMetricSummary;
  holdout: ChanMetricSummary;
  verdict: 'candidate' | 'development-drag' | 'holdout-warning' | 'consistent-drag';
  reasons: string[];
  draggingPeriods: ChanValidationPeriod[];
  draggingRegimes: ChanMarketRegime[];
}

export interface ChanDatasetValidationReport {
  symbol: string;
  period: ChanValidationPeriod;
  assetType: ChanAssetType;
  source?: string;
  barCount: number;
  firstTime: ChanTime;
  lastTime: ChanTime;
  buyAndHoldNetReturn: number;
  replay: ChanReplayResult;
  trades: ChanTradeEvaluation[];
  ruleTrades: ChanTradeEvaluation[];
  metrics: ChanMetricSummary[];
  variantMetrics: ChanVariantMetricSummary[];
  upsideOpportunities: ChanUpsideOpportunity[];
}

export interface ChanValidationReport {
  schemaVersion: string;
  algorithmVersion: string;
  options: ChanBacktestOptions;
  summary: {
    datasetCount: number;
    barCount: number;
    signalCount: number;
    ruleSignalCount: number;
    stabilityViolationCount: number;
    tradeEvaluationCount: number;
    ruleTradeEvaluationCount: number;
    executableTradeEvaluationCount: number;
    developmentTradeEvaluationCount: number;
    holdoutTradeEvaluationCount: number;
    upsideOpportunityCount: number;
    coveredUpsideOpportunityCount: number;
  };
  metrics: ChanMetricSummary[];
  variantMetrics: ChanVariantMetricSummary[];
  metricSlices: ChanMetricSlice[];
  opportunityCoverage: ChanOpportunityCoverage[];
  variantOpportunityCoverage: ChanVariantOpportunityCoverage[];
  opportunitySensitivity: ChanOpportunitySensitivity[];
  ruleDiagnostics: ChanRuleDiagnostic[];
  datasets: ChanDatasetValidationReport[];
}

const DEFAULT_OPTIONS: ChanBacktestOptions = {
  horizons: [5, 10, 20],
  feeBps: 3,
  sellTaxBps: 5,
  slippageBps: 2,
  developmentRatio: 0.7,
  enableTdxMultiscale: false,
  ...DEFAULT_CHAN_MARKET_REGIME_OPTIONS,
};

const SIGNAL_STABLE_FIELDS: Array<keyof ChanSignal> = [
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

const VALID_PERIODS = new Set<ChanValidationPeriod>([
  'day', 'week', 'month', '5m', '15m', '30m', '60m',
]);
const VALID_ASSET_TYPES = new Set<ChanAssetType>([
  'stock', 'index', 'etf', 'fund', 'unknown',
]);

function round(value: number): number {
  return Number(value.toFixed(8));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseFiniteNumber(value: unknown, label: string): number {
  const number = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(number)) throw new Error(`${label} 必须是有限数字`);
  return number;
}

function validatePoint(value: unknown, index: number): StockChartPoint {
  if (!isRecord(value)) throw new Error(`points[${index}] 必须是对象`);
  const time = value.time;
  if (!(typeof time === 'string' && time.trim())
    && !(typeof time === 'number' && Number.isFinite(time))) {
    throw new Error(`points[${index}].time 必须是非空字符串或有限数字`);
  }
  const point: StockChartPoint = {
    time,
    open: parseFiniteNumber(value.open, `points[${index}].open`),
    high: parseFiniteNumber(value.high, `points[${index}].high`),
    low: parseFiniteNumber(value.low, `points[${index}].low`),
    close: parseFiniteNumber(value.close, `points[${index}].close`),
    volume: parseFiniteNumber(value.volume, `points[${index}].volume`),
  };
  if ([point.open, point.high, point.low, point.close].some((price) => price <= 0)) {
    throw new Error(`points[${index}] 的价格必须大于 0`);
  }
  if (point.volume < 0) throw new Error(`points[${index}].volume 不能小于 0`);
  if (point.high < Math.max(point.open, point.close, point.low)
    || point.low > Math.min(point.open, point.close, point.high)) {
    throw new Error(`points[${index}] 的 high/low 与 OHLC 不一致`);
  }
  return point;
}

function validateTimeOrder(points: readonly StockChartPoint[]): void {
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1].time;
    const current = points[index].time;
    if (typeof previous !== typeof current) {
      throw new Error('同一数据集的 time 类型必须保持一致');
    }
    if (typeof current === 'number') {
      if (current <= (previous as number)) throw new Error(`points[${index}].time 必须严格递增`);
    } else if (current <= (previous as string)) {
      throw new Error(`points[${index}].time 必须严格递增`);
    }
  }
}

export function inferChanAssetType(symbol: string): ChanAssetType {
  const normalized = symbol.trim().toLowerCase();
  if (/^sh000\d{3}$/.test(normalized) || /^sz399\d{3}$/.test(normalized)) return 'index';
  if (/^(sh|sz|bj)\d{6}$/.test(normalized)) return 'stock';
  return 'unknown';
}

export function parseChanValidationDatasets(value: unknown): ChanValidationDataset[] {
  const rawDatasets = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.datasets) ? value.datasets : [value];
  if (!rawDatasets.length) throw new Error('验证数据至少需要一个数据集');

  return rawDatasets.map((raw, datasetIndex) => {
    if (!isRecord(raw)) throw new Error(`datasets[${datasetIndex}] 必须是对象`);
    const symbol = typeof raw.symbol === 'string' && raw.symbol.trim()
      ? raw.symbol.trim()
      : `dataset-${datasetIndex + 1}`;
    const period = raw.period;
    if (typeof period !== 'string' || !VALID_PERIODS.has(period as ChanValidationPeriod)) {
      throw new Error(`datasets[${datasetIndex}].period 不是支持的 K 线周期`);
    }
    if (!Array.isArray(raw.points) || !raw.points.length) {
      throw new Error(`datasets[${datasetIndex}].points 不能为空`);
    }
    const points = raw.points.map(validatePoint);
    validateTimeOrder(points);
    const assetType = raw.assetType === undefined
      ? inferChanAssetType(symbol)
      : raw.assetType;
    if (typeof assetType !== 'string' || !VALID_ASSET_TYPES.has(assetType as ChanAssetType)) {
      throw new Error(`datasets[${datasetIndex}].assetType 不是支持的资产类型`);
    }
    return {
      symbol,
      period: period as ChanValidationPeriod,
      assetType: assetType as ChanAssetType,
      source: typeof raw.source === 'string' && raw.source.trim()
        ? raw.source.trim()
        : undefined,
      points,
    };
  });
}

export function normalizeChanBacktestOptions(
  options: Partial<ChanBacktestOptions> = {}
): ChanBacktestOptions {
  const horizons = [...new Set(options.horizons ?? DEFAULT_OPTIONS.horizons)]
    .sort((left, right) => left - right);
  if (!horizons.length || horizons.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new Error('horizons 必须包含正整数');
  }
  const feeBps = options.feeBps ?? DEFAULT_OPTIONS.feeBps;
  const sellTaxBps = options.sellTaxBps ?? DEFAULT_OPTIONS.sellTaxBps;
  const slippageBps = options.slippageBps ?? DEFAULT_OPTIONS.slippageBps;
  if (![feeBps, sellTaxBps, slippageBps]
    .every((value) => Number.isFinite(value) && value >= 0)) {
    throw new Error('feeBps、sellTaxBps 和 slippageBps 必须是非负有限数字');
  }
  const developmentRatio = options.developmentRatio ?? DEFAULT_OPTIONS.developmentRatio;
  if (!Number.isFinite(developmentRatio) || developmentRatio <= 0 || developmentRatio >= 1) {
    throw new Error('developmentRatio 必须大于 0 且小于 1');
  }
  const regimeMaBars = options.regimeMaBars ?? DEFAULT_OPTIONS.regimeMaBars;
  const regimeSlopeBars = options.regimeSlopeBars ?? DEFAULT_OPTIONS.regimeSlopeBars;
  if (![regimeMaBars, regimeSlopeBars].every((value) => Number.isInteger(value) && value > 0)) {
    throw new Error('regimeMaBars 和 regimeSlopeBars 必须是正整数');
  }
  const regimeThreshold = options.regimeThreshold ?? DEFAULT_OPTIONS.regimeThreshold;
  if (!Number.isFinite(regimeThreshold) || regimeThreshold < 0) {
    throw new Error('regimeThreshold 必须是非负有限数字');
  }
  const enableTdxMultiscale = options.enableTdxMultiscale
    ?? DEFAULT_OPTIONS.enableTdxMultiscale;
  if (typeof enableTdxMultiscale !== 'boolean') {
    throw new Error('enableTdxMultiscale 必须是布尔值');
  }
  return {
    horizons,
    feeBps,
    sellTaxBps,
    slippageBps,
    developmentRatio,
    regimeMaBars,
    regimeSlopeBars,
    regimeThreshold,
    enableTdxMultiscale,
  };
}

function changedSignalFields(left: ChanSignal, right: ChanSignal): string[] {
  return SIGNAL_STABLE_FIELDS.filter((field) => left[field] !== right[field]);
}

export function replayChanAnalysis(
  points: readonly StockChartPoint[],
  period?: ChanValidationPeriod,
  analysisOptions: Pick<ChanAnalysisOptions, 'enableTdxMultiscale'> = {}
): ChanReplayResult {
  const observedSignals = new Map<string, ChanReplaySignal>();
  const observedRuleSignals = new Map<string, ChanReplaySignal>();
  const violations: ChanStabilityViolation[] = [];
  const violationKeys = new Set<string>();

  const addViolation = (
    signal: ChanReplaySignal,
    kind: ChanStabilityViolationKind,
    checkedAtIndex: number,
    changedFields?: string[]
  ) => {
    const key = `${signal.id}:${kind}`;
    if (violationKeys.has(key)) return;
    violationKeys.add(key);
    violations.push({
      signalId: signal.id,
      kind,
      firstSeenIndex: signal.firstSeenIndex,
      checkedAtIndex,
      checkedAtTime: points[checkedAtIndex].time,
      changedFields,
    });
  };

  const observe = (
    currentSignals: readonly ChanSignal[],
    observed: Map<string, ChanReplaySignal>,
    index: number,
    auditStability: boolean
  ) => {
    const currentById = new Map(currentSignals.map((signal) => [signal.id, signal]));
    currentSignals.forEach((signal) => {
      const existing = observed.get(signal.id);
      if (!existing) {
        const replaySignal: ChanReplaySignal = {
          ...signal,
          firstSeenIndex: index,
          firstSeenTime: points[index].time,
          confirmationLagBars: index - signal.confirmedIndex,
        };
        observed.set(signal.id, replaySignal);
        if (auditStability && signal.confirmedIndex > index) {
          addViolation(replaySignal, 'future-confirmation', index);
        }
        return;
      }
      if (!auditStability) return;
      const changedFields = changedSignalFields(existing, signal);
      if (changedFields.length) addViolation(existing, 'mutated', index, changedFields);
    });

    if (!auditStability) return;
    observed.forEach((signal) => {
      if (signal.firstSeenIndex < index && !currentById.has(signal.id)) {
        addViolation(signal, 'missing', index);
      }
    });
  };

  points.forEach((_point, index) => {
    const analysis = analyzeChan(points.slice(0, index + 1), {
      period,
      enableTdxMultiscale: analysisOptions.enableTdxMultiscale,
    });
    observe(analysis.signals, observedSignals, index, false);
    observe(analysis.signalMatches, observedRuleSignals, index, true);
  });

  const sortSignals = (signals: Iterable<ChanReplaySignal>) => [...signals].sort(
    (left, right) => left.firstSeenIndex - right.firstSeenIndex || left.level - right.level
  );

  return {
    algorithmVersion: CHAN_ALGORITHM_VERSION,
    barCount: points.length,
    signals: sortSignals(observedSignals.values()),
    ruleSignals: sortSignals(observedRuleSignals.values()),
    stabilityViolations: violations.sort(
      (left, right) => left.checkedAtIndex - right.checkedAtIndex
    ),
  };
}

function directionalReturn(side: ChanSignalSide, entry: number, exit: number): number {
  return side === 'buy' ? exit / entry - 1 : (entry - exit) / entry;
}

function calculateExcursion(
  side: ChanSignalSide,
  entry: number,
  bars: readonly StockChartPoint[]
): { mfe: number; mae: number } {
  if (side === 'buy') {
    return {
      mfe: Math.max(...bars.map((point) => point.high / entry - 1)),
      mae: Math.min(...bars.map((point) => point.low / entry - 1)),
    };
  }
  return {
    mfe: Math.max(...bars.map((point) => (entry - point.low) / entry)),
    mae: Math.min(...bars.map((point) => (entry - point.high) / entry)),
  };
}

export function evaluateChanSignals(
  dataset: ChanValidationDataset,
  replay: ChanReplayResult,
  options: Partial<ChanBacktestOptions> = {},
  signals: readonly ChanReplaySignal[] = replay.signals
): ChanTradeEvaluation[] {
  const normalized = normalizeChanBacktestOptions(options);
  const slippage = normalized.slippageBps / 10000;
  const assetType = dataset.assetType ?? inferChanAssetType(dataset.symbol);
  const taxableStock = assetType === 'stock' || assetType === 'unknown';
  const trades: ChanTradeEvaluation[] = [];
  const splitIndex = Math.floor(dataset.points.length * normalized.developmentRatio);

  signals.forEach((signal) => {
    const entryIndex = signal.firstSeenIndex + 1;
    const entryBar = dataset.points[entryIndex];
    if (!entryBar) return;
    normalized.horizons.forEach((horizon) => {
      const exitIndex = entryIndex + horizon - 1;
      const exitBar = dataset.points[exitIndex];
      if (!exitBar) return;
      const sample: ChanValidationSample | undefined = exitIndex < splitIndex
        ? 'development'
        : entryIndex >= splitIndex ? 'holdout' : undefined;
      if (!sample) return;
      const rawEntry = entryBar.open;
      const rawExit = exitBar.close;
      const returnMode: ChanReturnMode = signal.side === 'buy'
        ? 'long'
        : 'downside-follow-through';
      const roundTripCostBps = signal.side === 'buy'
        ? normalized.feeBps * 2 + (taxableStock ? normalized.sellTaxBps : 0)
        : 0;
      const adjustedEntry = signal.side === 'buy' ? rawEntry * (1 + slippage) : rawEntry;
      const adjustedExit = signal.side === 'buy' ? rawExit * (1 - slippage) : rawExit;
      const excursion = calculateExcursion(
        signal.side,
        rawEntry,
        dataset.points.slice(entryIndex, exitIndex + 1)
      );
      trades.push({
        symbol: dataset.symbol,
        period: dataset.period,
        assetType,
        sample,
        regime: classifyMarketRegime(dataset.points, signal.firstSeenIndex, normalized),
        signalId: signal.id,
        side: signal.side,
        returnMode,
        executable: signal.side === 'buy' && assetType !== 'index',
        roundTripCostBps,
        level: signal.level,
        variant: signal.variant,
        signalTime: signal.time,
        confirmedTime: signal.confirmedTime,
        availableIndex: signal.firstSeenIndex,
        availableTime: signal.firstSeenTime,
        entryIndex,
        entryTime: entryBar.time,
        entryPrice: rawEntry,
        horizon,
        exitIndex,
        exitTime: exitBar.time,
        exitPrice: rawExit,
        grossReturn: round(directionalReturn(signal.side, rawEntry, rawExit)),
        netReturn: round(
          directionalReturn(signal.side, adjustedEntry, adjustedExit) - roundTripCostBps / 10000
        ),
        mfe: round(excursion.mfe),
        mae: round(excursion.mae),
      });
    });
  });

  return trades.sort(
    (left, right) => left.availableIndex - right.availableIndex || left.horizon - right.horizon
  );
}

function average(values: readonly number[]): number | null {
  return values.length ? round(values.reduce((total, value) => total + value, 0) / values.length) : null;
}

function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return round(sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2);
}

function sequentialSignalDrawdown(returns: readonly number[]): number {
  let equity = 1;
  let peak = 1;
  let drawdown = 0;
  returns.forEach((value) => {
    equity *= Math.max(0, 1 + value);
    peak = Math.max(peak, equity);
    drawdown = Math.max(drawdown, peak ? 1 - equity / peak : 1);
  });
  return round(drawdown);
}

function summarizeTrades(
  trades: readonly ChanTradeEvaluation[],
  horizon: number,
  side: ChanSignalSide | 'all',
  level: ChanSignalLevel | 'all'
): ChanMetricSummary {
  const selected = trades
    .filter((trade) => trade.horizon === horizon)
    .filter((trade) => side === 'all' || trade.side === side)
    .filter((trade) => level === 'all' || trade.level === level)
    .sort((left, right) => {
      const leftTime = typeof left.availableTime === 'number'
        ? left.availableTime * 1000
        : Date.parse(left.availableTime);
      const rightTime = typeof right.availableTime === 'number'
        ? right.availableTime * 1000
        : Date.parse(right.availableTime);
      return leftTime - rightTime
        || left.symbol.localeCompare(right.symbol)
        || left.period.localeCompare(right.period)
        || left.availableIndex - right.availableIndex;
    });
  const returns = selected.map((trade) => trade.netReturn);
  const wins = returns.filter((value) => value > 0);
  const losses = returns.filter((value) => value < 0);
  const grossProfit = wins.reduce((total, value) => total + value, 0);
  const grossLoss = Math.abs(losses.reduce((total, value) => total + value, 0));
  const byDataset = new Map<string, ChanTradeEvaluation[]>();
  selected.forEach((trade) => {
    const key = `${trade.symbol}\u0000${trade.period}`;
    const values = byDataset.get(key) ?? [];
    values.push(trade);
    byDataset.set(key, values);
  });
  const datasetDrawdowns = [...byDataset.values()].map((values) =>
    sequentialSignalDrawdown(values.map((trade) => trade.netReturn))
  );
  return {
    group: side === 'all' ? 'all' : `${side}:${level}`,
    side,
    level,
    horizon,
    tradeCount: selected.length,
    winCount: wins.length,
    lossCount: losses.length,
    winRate: selected.length ? round(wins.length / selected.length) : null,
    averageReturn: average(returns),
    medianReturn: median(returns),
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss) : null,
    sequentialSignalDrawdown: selected.length ? sequentialSignalDrawdown(returns) : null,
    medianDatasetSignalDrawdown: median(datasetDrawdowns),
    worstDatasetSignalDrawdown: datasetDrawdowns.length ? Math.max(...datasetDrawdowns) : null,
    averageMfe: average(selected.map((trade) => trade.mfe)),
    averageMae: average(selected.map((trade) => trade.mae)),
  };
}

export function buildChanMetrics(
  trades: readonly ChanTradeEvaluation[],
  horizons: readonly number[]
): ChanMetricSummary[] {
  const groups: Array<[ChanSignalSide | 'all', ChanSignalLevel | 'all']> = [
    ['all', 'all'],
    ['buy', 1], ['sell', 1],
    ['buy', 2], ['sell', 2],
    ['buy', 3], ['sell', 3],
  ];
  return horizons.flatMap((horizon) =>
    groups.map(([side, level]) => summarizeTrades(trades, horizon, side, level))
  );
}

function buildVariantMetrics(
  trades: readonly ChanTradeEvaluation[],
  horizons: readonly number[]
): ChanVariantMetricSummary[] {
  return CHAN_SIGNAL_VARIANTS.flatMap((variant) => horizons.map((horizon) => ({
    ...summarizeTrades(
      trades.filter((trade) => trade.variant === variant),
      horizon,
      'all',
      'all'
    ),
    group: `variant:${variant}`,
    variant,
  })));
}

const CHAN_SIGNAL_VARIANTS: readonly ChanSignalVariant[] = [
  'standard', 'local-divergence', 'local-second', 'tdx-multiscale', 'tdx-class-two',
];

interface ChanOpportunityOptions {
  horizon: number;
  signalWindow: number;
  cooldown: number;
  thresholdAdjustment: number;
}

const DEFAULT_OPPORTUNITY_OPTIONS: ChanOpportunityOptions = {
  horizon: 20,
  signalWindow: 8,
  cooldown: 10,
  thresholdAdjustment: 0,
};
const OPPORTUNITY_THRESHOLD_ADJUSTMENTS = [-0.03, 0, 0.03] as const;
const OPPORTUNITY_SIGNAL_WINDOWS = [5, 8, 11] as const;

function upsideOpportunityThreshold(
  period: ChanValidationPeriod,
  adjustment: number
): number {
  return Math.max(0, (period === 'week' ? 0.12 : 0.15) + adjustment);
}

export function evaluateUpsideOpportunities(
  dataset: ChanValidationDataset,
  replay: ChanReplayResult,
  options: Partial<ChanBacktestOptions> = {},
  signals: readonly ChanReplaySignal[] = replay.signals,
  opportunityOptions: Partial<ChanOpportunityOptions> = {}
): ChanUpsideOpportunity[] {
  const normalized = normalizeChanBacktestOptions(options);
  const opportunity = { ...DEFAULT_OPPORTUNITY_OPTIONS, ...opportunityOptions };
  const points = dataset.points;
  const splitIndex = Math.floor(points.length * normalized.developmentRatio);
  const opportunities: ChanUpsideOpportunity[] = [];
  let lastOpportunityIndex = -opportunity.cooldown;
  for (let index = 2; index < points.length - opportunity.horizon; index += 1) {
    if (index - lastOpportunityIndex < opportunity.cooldown) continue;
    const current = points[index];
    const localBottom = [points[index - 2], points[index - 1], points[index + 1], points[index + 2]]
      .every((point) => current.low < point.low);
    if (!localBottom) continue;
    const forwardBars = points.slice(index + 1, index + opportunity.horizon + 1);
    const peakClose = Math.max(...forwardBars.map((point) => point.close));
    const forwardReturn = peakClose / current.close - 1;
    if (forwardReturn < upsideOpportunityThreshold(
      dataset.period,
      opportunity.thresholdAdjustment
    )) continue;
    lastOpportunityIndex = index;
    const sample = index + opportunity.horizon < splitIndex
      ? 'development'
      : index >= splitIndex ? 'holdout' : undefined;
    if (!sample) continue;
    const signal = signals.find((candidate) =>
      candidate.side === 'buy'
      && candidate.firstSeenIndex >= index
      && candidate.firstSeenIndex <= index + opportunity.signalWindow
    );
    opportunities.push({
      symbol: dataset.symbol,
      period: dataset.period,
      sample,
      startIndex: index,
      startTime: current.time,
      startPrice: current.close,
      horizon: opportunity.horizon,
      forwardReturn: round(forwardReturn),
      covered: Boolean(signal),
      signalId: signal?.id,
    });
  }
  return opportunities;
}

function buildOpportunityCoverage(
  opportunities: readonly ChanUpsideOpportunity[]
): ChanOpportunityCoverage[] {
  const samples: Array<ChanValidationSample | 'all'> = ['all', 'development', 'holdout'];
  const periods = ['all', ...new Set(opportunities.map((item) => item.period))] as Array<
    ChanValidationPeriod | 'all'
  >;
  return samples.flatMap((sample) => periods.map((period) => {
    const selected = opportunities
      .filter((item) => sample === 'all' || item.sample === sample)
      .filter((item) => period === 'all' || item.period === period);
    const coveredCount = selected.filter((item) => item.covered).length;
    return {
      sample,
      period,
      eventCount: selected.length,
      coveredCount,
      coverageRate: selected.length ? round(coveredCount / selected.length) : null,
    };
  }));
}

function buildVariantOpportunityCoverage(
  datasets: readonly ChanValidationDataset[],
  reports: readonly ChanDatasetValidationReport[],
  options: ChanBacktestOptions
): ChanVariantOpportunityCoverage[] {
  return CHAN_SIGNAL_VARIANTS.flatMap((variant) => {
    const opportunities = datasets.flatMap((dataset, index) => {
      const replay = reports[index].replay;
      return evaluateUpsideOpportunities(
        dataset,
        replay,
        options,
        replay.ruleSignals.filter((signal) => signal.variant === variant)
      );
    });
    return buildOpportunityCoverage(opportunities).map((coverage) => ({
      ...coverage,
      variant,
    }));
  });
}

function buildOpportunitySensitivity(
  datasets: readonly ChanValidationDataset[],
  reports: readonly ChanDatasetValidationReport[],
  options: ChanBacktestOptions
): ChanOpportunitySensitivity[] {
  return OPPORTUNITY_THRESHOLD_ADJUSTMENTS.flatMap((thresholdAdjustment) =>
    OPPORTUNITY_SIGNAL_WINDOWS.map((signalWindow) => {
      const opportunities = datasets.flatMap((dataset, index) =>
        evaluateUpsideOpportunities(
          dataset,
          reports[index].replay,
          options,
          reports[index].replay.signals,
          { thresholdAdjustment, signalWindow }
        )
      );
      return {
        thresholdAdjustment,
        signalWindow,
        coverage: buildOpportunityCoverage(opportunities),
      };
    })
  );
}

function buildMetricSlices(
  trades: readonly ChanTradeEvaluation[],
  horizons: readonly number[]
): ChanMetricSlice[] {
  const samples: Array<ChanValidationSample | 'all'> = ['all', 'development', 'holdout'];
  const periods = ['all', ...new Set(trades.map((trade) => trade.period))] as Array<
    ChanValidationPeriod | 'all'
  >;
  const regimes: Array<ChanMarketRegime | 'all'> = ['all', 'bull', 'bear', 'sideways'];
  const slices: ChanMetricSlice[] = [];

  samples.forEach((sample) => {
    periods.forEach((period) => {
      regimes.forEach((regime) => {
        // Keep useful one- and two-dimensional cuts without generating an opaque cube.
        const dimensions = Number(sample !== 'all') + Number(period !== 'all') + Number(regime !== 'all');
        if (dimensions > 2 || (period !== 'all' && regime !== 'all')) return;
        const selected = trades
          .filter((trade) => sample === 'all' || trade.sample === sample)
          .filter((trade) => period === 'all' || trade.period === period)
          .filter((trade) => regime === 'all' || trade.regime === regime);
        buildChanMetrics(selected, horizons).forEach((metric) => slices.push({
          ...metric,
          sample,
          period,
          regime,
        }));
      });
    });
  });
  return slices;
}

function isDrag(metric: ChanMetricSummary): boolean {
  return metric.tradeCount >= 5
    && (metric.averageReturn ?? 0) <= 0
    && (metric.profitFactor ?? 0) < 1;
}

function buildRuleDiagnostics(
  trades: readonly ChanTradeEvaluation[],
  horizons: readonly number[]
): ChanRuleDiagnostic[] {
  const rules: Array<[ChanSignalSide, ChanSignalLevel]> = [
    ['buy', 1], ['sell', 1],
    ['buy', 2], ['sell', 2],
    ['buy', 3], ['sell', 3],
  ];
  return horizons.flatMap((horizon) => rules.map(([side, level]) => {
    const development = summarizeTrades(
      trades.filter((trade) => trade.sample === 'development'),
      horizon,
      side,
      level
    );
    const holdout = summarizeTrades(
      trades.filter((trade) => trade.sample === 'holdout'),
      horizon,
      side,
      level
    );
    const developmentDrag = isDrag(development);
    const holdoutDrag = isDrag(holdout);
    const reasons: string[] = [];
    if (development.tradeCount < 5) reasons.push('开发集样本少于 5 笔，暂不据此调参');
    if (developmentDrag) reasons.push('开发集平均收益不为正且利润因子低于 1');
    if (holdout.tradeCount < 5) reasons.push('留出集样本少于 5 笔，结论可信度有限');
    if (holdoutDrag) reasons.push('留出集平均收益不为正且利润因子低于 1');
    const developmentTrades = trades.filter((trade) => trade.sample === 'development');
    const draggingPeriods = ([...new Set(developmentTrades.map((trade) => trade.period))]
      .filter((period) => isDrag(summarizeTrades(
        developmentTrades.filter((trade) => trade.period === period),
        horizon,
        side,
        level
      ))) as ChanValidationPeriod[]);
    const draggingRegimes = (['bull', 'bear', 'sideways'] as ChanMarketRegime[])
      .filter((regime) => isDrag(summarizeTrades(
        developmentTrades.filter((trade) => trade.regime === regime),
        horizon,
        side,
        level
      )));
    if (draggingPeriods.length) reasons.push(`开发集拖累周期：${draggingPeriods.join('、')}`);
    if (draggingRegimes.length) reasons.push(`开发集拖累市场状态：${draggingRegimes.join('、')}`);
    const verdict: ChanRuleDiagnostic['verdict'] = developmentDrag && holdoutDrag
      ? 'consistent-drag'
      : developmentDrag ? 'development-drag'
        : holdoutDrag ? 'holdout-warning' : 'candidate';
    return {
      side,
      level,
      horizon,
      development,
      holdout,
      verdict,
      reasons,
      draggingPeriods,
      draggingRegimes,
    };
  }));
}

function buyAndHoldReturn(
  points: readonly StockChartPoint[],
  assetType: ChanAssetType,
  options: ChanBacktestOptions
): number {
  const slippage = options.slippageBps / 10000;
  const entry = points[0].open * (1 + slippage);
  const exit = points[points.length - 1].close * (1 - slippage);
  const sellTaxBps = assetType === 'stock' || assetType === 'unknown'
    ? options.sellTaxBps
    : 0;
  return round(exit / entry - 1 - (options.feeBps * 2 + sellTaxBps) / 10000);
}

export function runChanValidation(
  datasets: readonly ChanValidationDataset[],
  options: Partial<ChanBacktestOptions> = {}
): ChanValidationReport {
  if (!datasets.length) throw new Error('验证数据至少需要一个数据集');
  const normalized = normalizeChanBacktestOptions(options);
  const reports = datasets.map((dataset) => {
    if (!dataset.points.length) throw new Error(`${dataset.symbol} 的行情数据为空`);
    const assetType = dataset.assetType ?? inferChanAssetType(dataset.symbol);
    const replay = replayChanAnalysis(dataset.points, dataset.period, {
      enableTdxMultiscale: normalized.enableTdxMultiscale,
    });
    const trades = evaluateChanSignals(dataset, replay, normalized);
    const ruleTrades = evaluateChanSignals(dataset, replay, normalized, replay.ruleSignals);
    const upsideOpportunities = evaluateUpsideOpportunities(dataset, replay, normalized);
    return {
      symbol: dataset.symbol,
      period: dataset.period,
      assetType,
      source: dataset.source,
      barCount: dataset.points.length,
      firstTime: dataset.points[0].time,
      lastTime: dataset.points[dataset.points.length - 1].time,
      buyAndHoldNetReturn: buyAndHoldReturn(dataset.points, assetType, normalized),
      replay,
      trades,
      ruleTrades,
      metrics: buildChanMetrics(trades, normalized.horizons),
      variantMetrics: buildVariantMetrics(ruleTrades, normalized.horizons),
      upsideOpportunities,
    };
  });
  const aggregateTrades = reports.flatMap((report) => report.trades);
  const aggregateRuleTrades = reports.flatMap((report) => report.ruleTrades);
  const aggregateOpportunities = reports.flatMap((report) => report.upsideOpportunities);
  return {
    schemaVersion: CHAN_VALIDATION_SCHEMA_VERSION,
    algorithmVersion: CHAN_ALGORITHM_VERSION,
    options: normalized,
    summary: {
      datasetCount: reports.length,
      barCount: reports.reduce((total, report) => total + report.barCount, 0),
      signalCount: reports.reduce((total, report) => total + report.replay.signals.length, 0),
      ruleSignalCount: reports.reduce(
        (total, report) => total + report.replay.ruleSignals.length,
        0
      ),
      stabilityViolationCount: reports.reduce(
        (total, report) => total + report.replay.stabilityViolations.length,
        0
      ),
      tradeEvaluationCount: aggregateTrades.length,
      ruleTradeEvaluationCount: aggregateRuleTrades.length,
      executableTradeEvaluationCount: aggregateTrades.filter((trade) => trade.executable).length,
      developmentTradeEvaluationCount: aggregateTrades.filter(
        (trade) => trade.sample === 'development'
      ).length,
      holdoutTradeEvaluationCount: aggregateTrades.filter(
        (trade) => trade.sample === 'holdout'
      ).length,
      upsideOpportunityCount: aggregateOpportunities.length,
      coveredUpsideOpportunityCount: aggregateOpportunities.filter(
        (opportunity) => opportunity.covered
      ).length,
    },
    metrics: buildChanMetrics(aggregateTrades, normalized.horizons),
    variantMetrics: buildVariantMetrics(aggregateRuleTrades, normalized.horizons),
    metricSlices: buildMetricSlices(aggregateTrades, normalized.horizons),
    opportunityCoverage: buildOpportunityCoverage(aggregateOpportunities),
    variantOpportunityCoverage: buildVariantOpportunityCoverage(datasets, reports, normalized),
    opportunitySensitivity: buildOpportunitySensitivity(datasets, reports, normalized),
    ruleDiagnostics: buildRuleDiagnostics(aggregateTrades, normalized.horizons),
    datasets: reports,
  };
}
