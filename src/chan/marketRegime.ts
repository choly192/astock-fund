import { StockChartPoint } from '../shared/stockChartProtocol';

export type ChanMarketRegime = 'bull' | 'bear' | 'sideways';

export interface ChanMarketRegimeOptions {
  regimeMaBars: number;
  regimeSlopeBars: number;
  regimeThreshold: number;
}

export const DEFAULT_CHAN_MARKET_REGIME_OPTIONS: Readonly<ChanMarketRegimeOptions> = {
  regimeMaBars: 60,
  regimeSlopeBars: 20,
  regimeThreshold: 0.005,
};

function movingAverageAt(
  points: readonly StockChartPoint[],
  index: number,
  bars: number
): number | undefined {
  const start = index - bars + 1;
  if (start < 0) return undefined;
  let total = 0;
  for (let cursor = start; cursor <= index; cursor += 1) total += points[cursor].close;
  return total / bars;
}

export function classifyMarketRegime(
  points: readonly StockChartPoint[],
  availableIndex: number,
  options: ChanMarketRegimeOptions = DEFAULT_CHAN_MARKET_REGIME_OPTIONS
): ChanMarketRegime {
  const currentMa = movingAverageAt(points, availableIndex, options.regimeMaBars);
  const previousMa = movingAverageAt(
    points,
    availableIndex - options.regimeSlopeBars,
    options.regimeMaBars
  );
  if (currentMa === undefined || previousMa === undefined || previousMa === 0) return 'sideways';
  const closeDistance = points[availableIndex].close / currentMa - 1;
  const slope = currentMa / previousMa - 1;
  if (closeDistance > options.regimeThreshold && slope > options.regimeThreshold) return 'bull';
  if (closeDistance < -options.regimeThreshold && slope < -options.regimeThreshold) return 'bear';
  return 'sideways';
}
