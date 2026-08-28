import {
  ColorType,
  createChart,
  CrosshairMode,
  HistogramData,
  LineStyle,
  Time,
} from 'lightweight-charts';
import {
  StockChartData,
  StockChartPeriod,
  StockChartRequestMessage,
  StockChartResponseMessage,
} from '../shared/stockChartProtocol';

declare function acquireVsCodeApi(): { postMessage(message: StockChartRequestMessage): void };

function createPreviewData(period: StockChartPeriod): StockChartData {
  const intraday = period === 'trend' || period.endsWith('m');
  const start = Math.floor(Date.now() / 1000) - 120 * (intraday ? 60 : 24 * 60 * 60);
  const points = Array.from({ length: 120 }, (_item, index) => {
    const base = 100 + Math.sin(index / 10) * 3 + index * 0.015;
    const open = base + Math.sin(index * 1.7) * 0.5;
    const close = base + Math.cos(index * 1.3) * 0.5;
    const timestamp = start + index * (intraday ? 60 : 24 * 60 * 60);
    return {
      time: intraday ? timestamp : new Date(timestamp * 1000).toISOString().slice(0, 10),
      open,
      high: Math.max(open, close) + 0.7,
      low: Math.min(open, close) - 0.7,
      close,
      volume: 50000 + (index % 17) * 8000,
      average: period === 'trend' ? 100 + Math.sin(index / 14) * 1.5 : undefined,
    };
  });
  return {
    period,
    kind: period === 'trend' ? 'line' : 'candlestick',
    points,
    previousClose: 100,
  };
}

const vscode =
  typeof acquireVsCodeApi === 'function'
    ? acquireVsCodeApi()
    : {
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
const latestPoint = document.querySelector<HTMLElement>('.latest-point')!;
const headline = document.querySelector<HTMLElement>('.headline')!;
const priceElement = document.querySelector<HTMLElement>('.price')!;
const percentElement = document.querySelector<HTMLElement>('.percent')!;
const quoteTimeElement = document.querySelector<HTMLElement>('.quote-time')!;
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
    scaleMargins: { top: 0.08, bottom: 0.24 },
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
let volumeSeries: any;
let renderedPeriod: StockChartPeriod | undefined;
let renderedKind: StockChartData['kind'] | undefined;
let latestValue: { time: Time; price: number } | undefined;
let realtimePollTimer: number | undefined;
let nextRequestId = 0;
let activeRequestId = 0;
let requestPending = false;
let requestStartedAt = 0;

function clearSeries(): void {
  [mainSeries, averageSeries, volumeSeries].filter(Boolean).forEach((series) => {
    chart.removeSeries(series);
  });
  mainSeries = undefined;
  averageSeries = undefined;
  volumeSeries = undefined;
  renderedPeriod = undefined;
  renderedKind = undefined;
  latestValue = undefined;
  latestPoint.classList.remove('visible', 'live');
  legend.textContent = '';
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
      mainSeries = chart.addLineSeries({
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
        averageSeries = chart.addLineSeries({
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
      mainSeries = chart.addCandlestickSeries({
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
  }

  if (!volumeSeries) {
    volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      priceLineVisible: false,
      lastValueVisible: false,
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
  }
  const volumes: HistogramData[] = data.points.map((point) => ({
    time: point.time as Time,
    value: point.volume,
    color: point.close >= point.open ? 'rgba(238, 75, 90, .48)' : 'rgba(22, 163, 109, .48)',
  }));
  volumeSeries.setData(volumes);
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
    return;
  }
  const value: any = param.seriesData.get(mainSeries);
  if (!value) return;
  const volume: any = volumeSeries ? param.seriesData.get(volumeSeries) : undefined;
  const average: any = averageSeries ? param.seriesData.get(averageSeries) : undefined;
  const time = formatChartTime(param.time as Time);
  const volumeText = volume?.value === undefined ? '' : `  量 ${formatCompactVolume(volume.value)}`;
  if ('open' in value) {
    legend.textContent = `${time}  开 ${value.open.toFixed(2)}  高 ${value.high.toFixed(
      2
    )}  低 ${value.low.toFixed(2)}  收 ${value.close.toFixed(2)}${volumeText}`;
  } else {
    const averageText = average?.value === undefined ? '' : `  均价 ${average.value.toFixed(2)}`;
    legend.textContent = `${time}  价格 ${value.value.toFixed(2)}${averageText}${volumeText}`;
  }
});

requestPeriod('trend');
