import type { StockChartPeriod, StockChartPoint } from '../shared/stockChartProtocol';

export const TDX_REVERSAL_RATIOS = {
  small: 0.05,
  medium: 0.10,
  large: 0.20,
} as const;

export type TdxMultiscalePeriod = Extract<
  StockChartPeriod,
  'day' | 'week' | '5m' | '15m' | '30m' | '60m'
>;

export interface TdxReversalRatios {
  small: number;
  medium: number;
  large: number;
}

export const TDX_REVERSAL_RATIOS_BY_PERIOD: Readonly<
  Record<TdxMultiscalePeriod, TdxReversalRatios>
> = {
  day: TDX_REVERSAL_RATIOS,
  week: TDX_REVERSAL_RATIOS,
  '5m': { small: 0.003, medium: 0.006, large: 0.012 },
  '15m': { small: 0.005, medium: 0.01, large: 0.02 },
  '30m': { small: 0.008, medium: 0.015, large: 0.03 },
  '60m': { small: 0.01, medium: 0.02, large: 0.04 },
};

export type CausalZigZagPivotType = 'top' | 'bottom';
export type TdxMultiscaleVariant = 'tdx-multiscale' | 'tdx-class-two';

export interface CausalZigZagPivot {
  type: CausalZigZagPivotType;
  index: number;
  time: StockChartPoint['time'];
  price: number;
  confirmedIndex: number;
  confirmedTime: StockChartPoint['time'];
  reversalRatio: number;
}

export interface TdxMultiscaleSignalCandidate {
  side: 'buy' | 'sell';
  level: 1 | 2;
  variant: TdxMultiscaleVariant;
  pivotIndex: number;
  time: StockChartPoint['time'];
  price: number;
  confirmedIndex: number;
  confirmedTime: StockChartPoint['time'];
  reason: string;
}

export interface TdxMultiscaleAnalysis {
  smallPivots: CausalZigZagPivot[];
  mediumPivots: CausalZigZagPivot[];
  largePivots: CausalZigZagPivot[];
  signals: TdxMultiscaleSignalCandidate[];
}

type ZigZagDirection = 'up' | 'down';

function createPivot(
  points: readonly StockChartPoint[],
  type: CausalZigZagPivotType,
  index: number,
  confirmedIndex: number,
  reversalRatio: number
): CausalZigZagPivot {
  return {
    type,
    index,
    time: points[index].time,
    price: points[index].close,
    confirmedIndex,
    confirmedTime: points[confirmedIndex].time,
    reversalRatio,
  };
}

/**
 * Close-price ZigZag whose pivots become visible only after the configured reversal.
 * Confirmed pivots are immutable when later bars are appended.
 */
export function detectCausalZigZag(
  points: readonly StockChartPoint[],
  reversalRatio: number
): CausalZigZagPivot[] {
  if (!Number.isFinite(reversalRatio) || reversalRatio <= 0 || reversalRatio >= 1) {
    throw new Error('reversalRatio 必须是大于 0 且小于 1 的有限数字');
  }
  if (points.length < 2) return [];

  const pivots: CausalZigZagPivot[] = [];
  let direction: ZigZagDirection | undefined;
  let highIndex = 0;
  let lowIndex = 0;
  let highPrice = points[0].close;
  let lowPrice = points[0].close;
  let extremeIndex = 0;
  let extremePrice = points[0].close;

  for (let index = 1; index < points.length; index += 1) {
    const close = points[index].close;
    if (!direction) {
      if (close >= highPrice) {
        highPrice = close;
        highIndex = index;
      }
      if (close <= lowPrice) {
        lowPrice = close;
        lowIndex = index;
      }
      if (close >= lowPrice * (1 + reversalRatio)) {
        pivots.push(createPivot(points, 'bottom', lowIndex, index, reversalRatio));
        direction = 'up';
        extremeIndex = index;
        extremePrice = close;
      } else if (close <= highPrice * (1 - reversalRatio)) {
        pivots.push(createPivot(points, 'top', highIndex, index, reversalRatio));
        direction = 'down';
        extremeIndex = index;
        extremePrice = close;
      }
      continue;
    }

    if (direction === 'up') {
      if (close >= extremePrice) {
        extremeIndex = index;
        extremePrice = close;
      } else if (close <= extremePrice * (1 - reversalRatio)) {
        pivots.push(createPivot(points, 'top', extremeIndex, index, reversalRatio));
        direction = 'down';
        extremeIndex = index;
        extremePrice = close;
      }
      continue;
    }

    if (close <= extremePrice) {
      extremeIndex = index;
      extremePrice = close;
    } else if (close >= extremePrice * (1 + reversalRatio)) {
      pivots.push(createPivot(points, 'bottom', extremeIndex, index, reversalRatio));
      direction = 'up';
      extremeIndex = index;
      extremePrice = close;
    }
  }
  return pivots;
}

export function getTdxReversalRatios(
  period: StockChartPeriod | undefined
): TdxReversalRatios | undefined {
  if (!period || !(period in TDX_REVERSAL_RATIOS_BY_PERIOD)) return undefined;
  return TDX_REVERSAL_RATIOS_BY_PERIOD[period as TdxMultiscalePeriod];
}

function candidateFromPivot(
  pivot: CausalZigZagPivot,
  side: TdxMultiscaleSignalCandidate['side'],
  level: TdxMultiscaleSignalCandidate['level'],
  variant: TdxMultiscaleVariant,
  reason: string
): TdxMultiscaleSignalCandidate {
  return {
    side,
    level,
    variant,
    pivotIndex: pivot.index,
    time: pivot.time,
    price: pivot.price,
    confirmedIndex: pivot.confirmedIndex,
    confirmedTime: pivot.confirmedTime,
    reason,
  };
}

function formatRatio(ratio: number): string {
  return `${Number((ratio * 100).toFixed(1))}%`;
}

export function analyzeTdxMultiscale(
  points: readonly StockChartPoint[],
  period?: StockChartPeriod
): TdxMultiscaleAnalysis {
  const empty = { smallPivots: [], mediumPivots: [], largePivots: [], signals: [] };
  const reversalRatios = getTdxReversalRatios(period);
  if (!reversalRatios) return empty;

  const smallPivots = detectCausalZigZag(points, reversalRatios.small);
  const mediumPivots = detectCausalZigZag(points, reversalRatios.medium);
  const largePivots = detectCausalZigZag(points, reversalRatios.large);
  const mediumRatio = formatRatio(reversalRatios.medium);
  const largeRatio = formatRatio(reversalRatios.large);
  const events = [
    ...mediumPivots.map((pivot) => ({ scale: 'medium' as const, pivot })),
    ...largePivots.map((pivot) => ({ scale: 'large' as const, pivot })),
  ].sort((left, right) =>
    left.pivot.confirmedIndex - right.pivot.confirmedIndex
    || (left.scale === right.scale ? 0 : left.scale === 'large' ? -1 : 1)
  );

  const signals: TdxMultiscaleSignalCandidate[] = [];
  let largeDirection: ZigZagDirection | undefined;
  let lastLargePivot: CausalZigZagPivot | undefined;
  let mediumBottomCount = 0;
  let mediumTopCount = 0;

  events.forEach(({ scale, pivot }) => {
    if (scale === 'large') {
      const hasPreviousLargePivot = Boolean(lastLargePivot);
      lastLargePivot = pivot;
      if (pivot.type === 'bottom') {
        largeDirection = 'up';
        mediumBottomCount = 1;
        mediumTopCount = 0;
        if (hasPreviousLargePivot) {
          signals.push(candidateFromPivot(
            pivot,
            'buy',
            1,
            'tdx-multiscale',
            `收盘价大级别下跌后反向达到 ${largeRatio}，确认多尺度一买`
          ));
        }
      } else {
        largeDirection = 'down';
        mediumTopCount = 1;
        mediumBottomCount = 0;
        if (hasPreviousLargePivot) {
          signals.push(candidateFromPivot(
            pivot,
            'sell',
            1,
            'tdx-multiscale',
            `收盘价大级别上涨后反向达到 ${largeRatio}，确认多尺度一卖`
          ));
        }
      }
      return;
    }

    if (!largeDirection) return;
    if (lastLargePivot?.index === pivot.index && lastLargePivot.type === pivot.type) return;
    if (pivot.type === 'bottom') {
      mediumBottomCount += 1;
      if (largeDirection === 'up' && mediumBottomCount === 2) {
        signals.push(candidateFromPivot(
          pivot,
          'buy',
          2,
          'tdx-multiscale',
          '大级别向上后的首次中级别回调结束，确认多尺度二买'
        ));
      } else if (largeDirection === 'down' && mediumBottomCount === 1) {
        signals.push(candidateFromPivot(
          pivot,
          'buy',
          2,
          'tdx-class-two',
          `大级别仍向下时首次出现 ${mediumRatio} 反转，记为类二买观察信号`
        ));
      }
      return;
    }

    mediumTopCount += 1;
    if (largeDirection === 'down' && mediumTopCount === 2) {
      signals.push(candidateFromPivot(
        pivot,
        'sell',
        2,
        'tdx-multiscale',
        '大级别向下后的首次中级别反弹结束，确认多尺度二卖'
      ));
    } else if (largeDirection === 'up' && mediumTopCount === 1) {
      signals.push(candidateFromPivot(
        pivot,
        'sell',
        2,
        'tdx-class-two',
        `大级别仍向上时首次出现 ${mediumRatio} 反转，记为类二卖观察信号`
      ));
    }
  });

  return {
    smallPivots,
    mediumPivots,
    largePivots,
    signals: signals.sort(
      (left, right) => left.confirmedIndex - right.confirmedIndex || left.level - right.level
    ),
  };
}
