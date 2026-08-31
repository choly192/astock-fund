import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  HistogramData,
  LineSeries,
  LineStyle,
  Time,
} from 'lightweight-charts';
import { analyzeChan, ChanSignal } from '../chan/engine';
import { buildChanSignalSeriesData } from '../chan/seriesData';
import {
  StockChartData,
  StockChartPeriod,
  StockChartRequestMessage,
  StockChartResponseMessage,
} from '../shared/stockChartProtocol';
import { ChanSignalPaneView } from './chanSignalSeries';
import { calculateMovingAverage } from './movingAverage';

interface ChartWebviewState {
  chanSignalsVisible?: boolean;
}

interface ChartVsCodeApi {
  postMessage(message: StockChartRequestMessage): void;
  getState(): ChartWebviewState | undefined;
  setState(state: ChartWebviewState): void;
}

declare function acquireVsCodeApi(): ChartVsCodeApi;

function createPreviewData(period: StockChartPeriod): StockChartData {
  if (period !== 'trend') {
    const anchorSets: Partial<Record<StockChartPeriod, number[]>> = {
      day: [10, 8, 12, 9, 11, 7, 9, 6.5, 10, 7.2, 10.5, 9],
      week: [10, 12, 8, 11, 9, 13, 11.5, 14, 12],
      month: [10, 8, 12, 9, 11, 7, 8.5, 6, 8],
    };
    const anchors = (anchorSets[period] ?? anchorSets.day!)
      .map((value) => 100 + (value - 10) * 2);
    const values: number[] = [];
    for (let segment = 0; segment < anchors.length - 1; segment += 1) {
      for (let offset = 0; offset < 4; offset += 1) {
        values.push(anchors[segment] + (anchors[segment + 1] - anchors[segment]) * offset / 4);
      }
    }
    values.push(anchors[anchors.length - 1]);
    while (values.length < 120) values.push(values[values.length - 1] - 0.006);

    const minuteSteps: Partial<Record<StockChartPeriod, number>> = {
      '5m': 5,
      '15m': 15,
      '30m': 30,
      '60m': 60,
    };
    const calendarSteps: Partial<Record<StockChartPeriod, number>> = {
      day: 24 * 60,
      week: 7 * 24 * 60,
      month: 30 * 24 * 60,
    };
    const stepSeconds = (minuteSteps[period] ?? calendarSteps[period] ?? 24 * 60) * 60;
    const start = Math.floor(Date.now() / 1000) - values.length * stepSeconds;
    return {
      period,
      kind: 'candlestick',
      points: values.map((value, index) => {
        const rising = index % 3 !== 1;
        const timestamp = start + index * stepSeconds;
        return {
          time: period.endsWith('m')
            ? timestamp
            : new Date(timestamp * 1000).toISOString().slice(0, 10),
          open: value + (rising ? -0.08 : 0.08),
          high: value + 0.35,
          low: value - 0.35,
          close: value + (rising ? 0.08 : -0.08),
          volume: 50000 + (index % 17) * 8000,
        };
      }),
      previousClose: 100,
    };
  }

  const start = Math.floor(Date.now() / 1000) - 120 * 60;
  const points = Array.from({ length: 120 }, (_item, index) => {
    const base = 100 + Math.sin(index / 10) * 3 + index * 0.015;
    const open = base + Math.sin(index * 1.7) * 0.5;
    const close = base + Math.cos(index * 1.3) * 0.5;
    const timestamp = start + index * 60;
    return {
      time: timestamp,
      open,
      high: Math.max(open, close) + 0.7,
      low: Math.min(open, close) - 0.7,
      close,
      volume: 50000 + (index % 17) * 8000,
      average: 100 + Math.sin(index / 14) * 1.5,
    };
  });
  return {
    period,
    kind: 'line',
    points,
    previousClose: 100,
  };
}

let previewState: ChartWebviewState = {};
const vscode: ChartVsCodeApi =
  typeof acquireVsCodeApi === 'function'
    ? acquireVsCodeApi()
    : {
        getState: () => previewState,
        setState: (state: ChartWebviewState) => {
          previewState = state;
        },
        postMessage(message: StockChartRequestMessage) {
          window.setTimeout(
            () =>
              window.dispatchEvent(
                new MessageEvent('message', {
                  data: {
                    type: 'chartData',
                    period: message.period,
                    requestId: message.requestId,
                    refresh: message.refresh,
                    marketOpen: true,
                    data: createPreviewData(message.period),
                  },
                })
              ),
            80
          );
        },
      };
const container = document.querySelector<HTMLElement>('.chart')!;
const loading = document.querySelector<HTMLElement>('.loading')!;
const legend = document.querySelector<HTMLElement>('.legend')!;
const movingAverageLegend = document.querySelector<HTMLElement>('.ma-legend')!;
const latestPoint = document.querySelector<HTMLElement>('.latest-point')!;
const headline = document.querySelector<HTMLElement>('.headline')!;
const priceElement = document.querySelector<HTMLElement>('.price')!;
const percentElement = document.querySelector<HTMLElement>('.percent')!;
const quoteTimeElement = document.querySelector<HTMLElement>('.quote-time')!;
const chanToggle = document.querySelector<HTMLInputElement>('.chan-toggle input')!;
const statElements = {
  open: document.querySelector<HTMLElement>('[data-stat="open"]')!,
  high: document.querySelector<HTMLElement>('[data-stat="high"]')!,
  low: document.querySelector<HTMLElement>('[data-stat="low"]')!,
  change: document.querySelector<HTMLElement>('[data-stat="change"]')!,
  volume: document.querySelector<HTMLElement>('[data-stat="volume"]')!,
};
const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.period-tab'));

const TREND_POLL_INTERVAL_MS = 5000;
const MINUTE_POLL_INTERVAL_MS = 15000;
const REQUEST_TIMEOUT_MS = 15000;
const MOVING_AVERAGES = [
  { period: 5, label: 'MA5', color: '#f3f4f6' },
  { period: 10, label: 'MA10', color: '#f0c94d' },
  { period: 20, label: 'MA20', color: '#d982d9' },
  { period: 60, label: 'MA60', color: '#52a8e8' },
] as const;
const isRealtimePeriod = (period: StockChartPeriod) =>
  period === 'trend' || period.endsWith('m');

const chart = createChart(container, {
  autoSize: true,
  layout: {
    background: { type: ColorType.Solid, color: '#0b0d10' },
    textColor: '#7d828c',
    fontFamily: 'Consolas, "Microsoft YaHei", monospace',
    fontSize: 11,
    attributionLogo: false,
  },
  grid: {
    vertLines: { color: '#1d2025' },
    horzLines: { color: '#1d2025' },
  },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: {
    borderColor: '#2b2e34',
    scaleMargins: { top: 0.08, bottom: 0.08 },
  },
  timeScale: {
    borderColor: '#2b2e34',
    timeVisible: true,
    secondsVisible: false,
    rightOffset: 3,
  },
  handleScroll: true,
  handleScale: true,
});

let currentPeriod: StockChartPeriod = 'trend';
let mainSeries: any;
let averageSeries: any;
const movingAverageSeries = new Map<number, any>();
const latestMovingAverageValues = new Map<number, number>();
let volumeSeries: any;
let chanSignalSeries: any;
let latestChartData: StockChartData | undefined;
let chanSignalsVisible = vscode.getState()?.chanSignalsVisible !== false;
let renderedPeriod: StockChartPeriod | undefined;
let renderedKind: StockChartData['kind'] | undefined;
let latestValue: { time: Time; price: number } | undefined;
let realtimePollTimer: number | undefined;
let nextRequestId = 0;
let activeRequestId = 0;
let requestPending = false;
let requestStartedAt = 0;

function clearSeries(): void {
  [chanSignalSeries, volumeSeries, ...movingAverageSeries.values(), averageSeries, mainSeries]
    .filter(Boolean).forEach((series) => {
      chart.removeSeries(series);
    });
  mainSeries = undefined;
  averageSeries = undefined;
  movingAverageSeries.clear();
  latestMovingAverageValues.clear();
  volumeSeries = undefined;
  chanSignalSeries = undefined;
  latestChartData = undefined;
  renderedPeriod = undefined;
  renderedKind = undefined;
  latestValue = undefined;
  latestPoint.classList.remove('visible', 'live');
  legend.textContent = '';
  movingAverageLegend.replaceChildren();
}

function syncChanToggle(period: StockChartPeriod): void {
  chanToggle.checked = chanSignalsVisible;
  chanToggle.disabled = period === 'trend';
}

function removeChanSignalPane(): void {
  if (!chanSignalSeries) return;
  chart.removeSeries(chanSignalSeries);
  chanSignalSeries = undefined;
}

function renderChanSignalPane(data: StockChartData): void {
  if (data.kind !== 'candlestick' || !chanSignalsVisible) {
    removeChanSignalPane();
    return;
  }
  const analysis = analyzeChan(data.points, { period: data.period });
  if (!chanSignalSeries) {
    chanSignalSeries = chart.addCustomSeries(
      new ChanSignalPaneView(),
      {
        priceScaleId: 'chan-signal',
        lastValueVisible: false,
        priceLineVisible: false,
      },
      2
    );
    chanSignalSeries.priceScale().applyOptions({
      visible: false,
      scaleMargins: { top: 0.08, bottom: 0.08 },
    });
    chanSignalSeries.getPane().setHeight(66);
  }
  chanSignalSeries.setData(buildChanSignalSeriesData(data.points, analysis.signals));
}

function formatChanSignals(signals: readonly ChanSignal[]): string {
  return signals.map((signal) => `${signal.level}${signal.side === 'buy' ? '买' : '卖'}`).join('/');
}

function formatChanSignalDetails(signals: readonly ChanSignal[]): string {
  return signals.map((signal) =>
    `${signal.level}${signal.side === 'buy' ? '买' : '卖'}：${signal.reason}；`
    + `确认于 ${formatChartTime(signal.confirmedTime as Time)}`
  ).join('\n');
}

function renderMovingAverageLegend(values: ReadonlyMap<number, number>): void {
  const items = MOVING_AVERAGES.flatMap((definition) => {
    const value = values.get(definition.period);
    if (value === undefined) return [];
    const item = document.createElement('span');
    item.style.color = definition.color;
    item.textContent = `${definition.label} ${value.toFixed(2)}`;
    return [item];
  });
  movingAverageLegend.replaceChildren(...items);
}

function setLoading(message: string, error = false): void {
  loading.textContent = message;
  loading.classList.toggle('error', error);
  loading.hidden = false;
}

function updateLatestPointPosition(): void {
  if (currentPeriod !== 'trend' || !latestValue || !mainSeries || document.hidden) {
    latestPoint.classList.remove('visible');
    return;
  }
  const x = chart.timeScale().timeToCoordinate(latestValue.time);
  const y = mainSeries.priceToCoordinate(latestValue.price);
  if (x === null || y === null || x < 0 || y < 0 || x > container.clientWidth || y > container.clientHeight) {
    latestPoint.classList.remove('visible');
    return;
  }
  latestPoint.style.left = `${x}px`;
  latestPoint.style.top = `${y}px`;
  latestPoint.classList.add('visible');
}

function formatCompactVolume(value: number): string {
  if (value >= 100000000) return `${(value / 100000000).toFixed(2)}亿`;
  if (value >= 10000) return `${(value / 10000).toFixed(2)}万`;
  return Math.round(value).toLocaleString('zh-CN');
}

function formatChartTime(time: Time): string {
  if (typeof time === 'number') {
    return new Date(time * 1000).toISOString().slice(0, 16).replace('T', ' ');
  }
  if (typeof time === 'string') return time;
  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`;
}

function updateQuoteSummary(data: StockChartData): void {
  if (data.period !== 'trend' || !data.points.length) return;
  const last = data.points[data.points.length - 1];
  const open = data.points[0].open;
  const high = Math.max(...data.points.map((point) => point.high));
  const low = Math.min(...data.points.map((point) => point.low));
  const volume = data.points.reduce((total, point) => total + point.volume, 0);
  priceElement.textContent = last.close.toFixed(2);
  statElements.open.textContent = open.toFixed(2);
  statElements.high.textContent = high.toFixed(2);
  statElements.low.textContent = low.toFixed(2);
  statElements.volume.textContent = formatCompactVolume(volume);
  quoteTimeElement.textContent = formatChartTime(last.time as Time);
  if (!data.previousClose) return;
  const change = last.close - data.previousClose;
  const percent = change / data.previousClose * 100;
  statElements.change.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}`;
  percentElement.textContent = `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`;
  headline.classList.toggle('rise', change > 0);
  headline.classList.toggle('fall', change < 0);
}

function render(data: StockChartData, marketOpen = true): void {
  const rebuild = !mainSeries || renderedPeriod !== data.period || renderedKind !== data.kind;
  if (rebuild) {
    clearSeries();
    renderedPeriod = data.period;
    renderedKind = data.kind;
  }
  const upColor = '#ee4b5a';
  const downColor = '#16a36d';
  if (data.kind === 'line') {
    if (!mainSeries) {
      mainSeries = chart.addSeries(LineSeries, {
        color: '#9f9f9f',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
      });
    }
    mainSeries.setData(
      data.points.map((point) => ({
        time: point.time as Time,
        value: point.close,
      }))
    );
    const averagePoints = data.points.filter((point) => point.average !== undefined);
    if (averagePoints.length) {
      if (!averageSeries) {
        averageSeries = chart.addSeries(LineSeries, {
          color: '#c7b448',
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        });
      }
      averageSeries.setData(
        averagePoints.map((point) => ({
          time: point.time as Time,
          value: point.average!,
        }))
      );
    } else if (averageSeries) {
      averageSeries.setData([]);
    }
    if (rebuild && data.previousClose) {
      mainSeries.createPriceLine({
        price: data.previousClose,
        color: '#555a63',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
        title: '昨收',
      });
    }
  } else {
    if (!mainSeries) {
      mainSeries = chart.addSeries(CandlestickSeries, {
        upColor,
        downColor,
        borderUpColor: upColor,
        borderDownColor: downColor,
        wickUpColor: upColor,
        wickDownColor: downColor,
        priceLineVisible: false,
      });
    }
    mainSeries.setData(
      data.points.map((point) => ({
        time: point.time as Time,
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
      }))
    );
    latestMovingAverageValues.clear();
    MOVING_AVERAGES.forEach((definition) => {
      const points = calculateMovingAverage(data.points, definition.period);
      let series = movingAverageSeries.get(definition.period);
      if (!series) {
        series = chart.addSeries(LineSeries, {
          color: definition.color,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        movingAverageSeries.set(definition.period, series);
      }
      series.setData(points.map((point) => ({
        time: point.time as Time,
        value: point.value,
      })));
      const latest = points[points.length - 1];
      if (latest) latestMovingAverageValues.set(definition.period, latest.value);
    });
    renderMovingAverageLegend(latestMovingAverageValues);
  }

  if (!volumeSeries) {
    volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      priceLineVisible: false,
      lastValueVisible: false,
    }, 1);
    volumeSeries.priceScale().applyOptions({
      visible: false,
      scaleMargins: { top: 0.08, bottom: 0 },
    });
    volumeSeries.getPane().setHeight(104);
  }
  const volumes: HistogramData[] = data.points.map((point) => ({
    time: point.time as Time,
    value: point.volume,
    color: point.close >= point.open ? 'rgba(238, 75, 90, .48)' : 'rgba(22, 163, 109, .48)',
  }));
  volumeSeries.setData(volumes);
  renderChanSignalPane(data);
  latestChartData = data;
  if (rebuild) chart.timeScale().fitContent();
  updateQuoteSummary(data);
  const last = data.points[data.points.length - 1];
  latestValue = data.period === 'trend' && last
    ? { time: last.time as Time, price: last.close }
    : undefined;
  latestPoint.classList.toggle('live', Boolean(latestValue && marketOpen));
  window.requestAnimationFrame(updateLatestPointPosition);
  loading.hidden = true;
}

function stopRealtimePolling(): void {
  if (realtimePollTimer !== undefined) window.clearInterval(realtimePollTimer);
  realtimePollTimer = undefined;
}

function startRealtimePolling(): void {
  if (realtimePollTimer !== undefined || !isRealtimePeriod(currentPeriod) || document.hidden) return;
  const interval = currentPeriod === 'trend' ? TREND_POLL_INTERVAL_MS : MINUTE_POLL_INTERVAL_MS;
  realtimePollTimer = window.setInterval(
    () => requestPeriod(currentPeriod, true),
    interval
  );
}

function requestPeriod(period: StockChartPeriod, refresh = false): void {
  if (refresh) {
    if (!isRealtimePeriod(period) || currentPeriod !== period || document.hidden) return;
    if (requestPending && Date.now() - requestStartedAt < REQUEST_TIMEOUT_MS) return;
  } else {
    currentPeriod = period;
    syncChanToggle(period);
    tabs.forEach((tab) => {
      const selected = tab.dataset.period === period;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', String(selected));
    });
    latestPoint.classList.remove('visible');
    setLoading('正在加载行情...');
    stopRealtimePolling();
  }

  if (isRealtimePeriod(period)) startRealtimePolling();
  else stopRealtimePolling();

  const requestId = ++nextRequestId;
  activeRequestId = requestId;
  requestPending = true;
  requestStartedAt = Date.now();
  vscode.postMessage({ type: 'loadPeriod', period, requestId, refresh });
}

tabs.forEach((tab) =>
  tab.addEventListener('click', () => {
    requestPeriod(tab.dataset.period as StockChartPeriod);
  })
);

chanToggle.addEventListener('change', () => {
  chanSignalsVisible = chanToggle.checked;
  vscode.setState({
    ...vscode.getState(),
    chanSignalsVisible,
  });
  if (latestChartData) renderChanSignalPane(latestChartData);
});

window.addEventListener('message', (event: MessageEvent<StockChartResponseMessage>) => {
  const message = event.data;
  if (!message || message.requestId !== activeRequestId || message.period !== currentPeriod) return;
  requestPending = false;
  if (message.refresh && message.marketOpen === false && !message.data) {
    latestPoint.classList.remove('live');
    return;
  }
  if (message.type === 'chartError' || !message.data) {
    if (message.refresh && mainSeries) return;
    setLoading(message.message || '行情数据加载失败', true);
    return;
  }
  render(message.data, message.marketOpen !== false);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopRealtimePolling();
    latestPoint.classList.remove('visible');
    return;
  }
  if (isRealtimePeriod(currentPeriod)) {
    requestPeriod(currentPeriod, true);
    startRealtimePolling();
  }
  updateLatestPointPosition();
});

chart.timeScale().subscribeVisibleLogicalRangeChange(() => updateLatestPointPosition());
window.addEventListener('resize', () => window.requestAnimationFrame(updateLatestPointPosition));
window.addEventListener('pagehide', stopRealtimePolling);

chart.subscribeCrosshairMove((param) => {
  if (!param.time || !mainSeries) {
    legend.textContent = '';
    legend.removeAttribute('title');
    renderMovingAverageLegend(latestMovingAverageValues);
    return;
  }
  const value: any = param.seriesData.get(mainSeries);
  if (!value) return;
  const volume: any = volumeSeries ? param.seriesData.get(volumeSeries) : undefined;
  const average: any = averageSeries ? param.seriesData.get(averageSeries) : undefined;
  const chanData: any = chanSignalSeries ? param.seriesData.get(chanSignalSeries) : undefined;
  const time = formatChartTime(param.time as Time);
  const volumeText = volume?.value === undefined ? '' : `  量 ${formatCompactVolume(volume.value)}`;
  const chanText = chanData?.signals?.length
    ? `  缠 ${formatChanSignals(chanData.signals)}`
    : '';
  if (chanData?.signals?.length) {
    legend.title = formatChanSignalDetails(chanData.signals);
  } else {
    legend.removeAttribute('title');
  }
  if ('open' in value) {
    const movingAverageValues = new Map<number, number>();
    MOVING_AVERAGES.forEach((definition) => {
      const series = movingAverageSeries.get(definition.period);
      const point: any = series ? param.seriesData.get(series) : undefined;
      if (point?.value !== undefined) movingAverageValues.set(definition.period, point.value);
    });
    renderMovingAverageLegend(movingAverageValues);
    legend.textContent = `${time}  开 ${value.open.toFixed(2)}  高 ${value.high.toFixed(
      2
    )}  低 ${value.low.toFixed(2)}  收 ${value.close.toFixed(2)}${volumeText}${chanText}`;
  } else {
    const averageText = average?.value === undefined ? '' : `  均价 ${average.value.toFixed(2)}`;
    legend.textContent = `${time}  价格 ${value.value.toFixed(2)}${averageText}${volumeText}`;
  }
});

syncChanToggle('trend');
requestPeriod('trend');
