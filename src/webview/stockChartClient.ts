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
const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.period-tab'));

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

function clearSeries(): void {
  [mainSeries, averageSeries, volumeSeries].filter(Boolean).forEach((series) => {
    chart.removeSeries(series);
  });
  mainSeries = undefined;
  averageSeries = undefined;
  volumeSeries = undefined;
  legend.textContent = '';
}

function setLoading(message: string, error = false): void {
  loading.textContent = message;
  loading.classList.toggle('error', error);
  loading.hidden = false;
}

function render(data: StockChartData): void {
  clearSeries();
  const upColor = '#ee4b5a';
  const downColor = '#16a36d';
  if (data.kind === 'line') {
    mainSeries = chart.addLineSeries({
      color: '#9f9f9f',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    mainSeries.setData(
      data.points.map((point) => ({
        time: point.time as Time,
        value: point.close,
      }))
    );
    const averagePoints = data.points.filter((point) => point.average !== undefined);
    if (averagePoints.length) {
      averageSeries = chart.addLineSeries({
        color: '#c7b448',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      averageSeries.setData(
        averagePoints.map((point) => ({
          time: point.time as Time,
          value: point.average!,
        }))
      );
    }
    if (data.previousClose) {
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
    mainSeries = chart.addCandlestickSeries({
      upColor,
      downColor,
      borderUpColor: upColor,
      borderDownColor: downColor,
      wickUpColor: upColor,
      wickDownColor: downColor,
      priceLineVisible: false,
    });
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

  volumeSeries = chart.addHistogramSeries({
    priceFormat: { type: 'volume' },
    priceScaleId: 'volume',
    priceLineVisible: false,
    lastValueVisible: false,
  });
  volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
  const volumes: HistogramData[] = data.points.map((point) => ({
    time: point.time as Time,
    value: point.volume,
    color: point.close >= point.open ? 'rgba(238, 75, 90, .48)' : 'rgba(22, 163, 109, .48)',
  }));
  volumeSeries.setData(volumes);
  chart.timeScale().fitContent();
  loading.hidden = true;
}

function requestPeriod(period: StockChartPeriod): void {
  currentPeriod = period;
  tabs.forEach((tab) => {
    const selected = tab.dataset.period === period;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', String(selected));
  });
  setLoading('正在加载行情...');
  vscode.postMessage({ type: 'loadPeriod', period });
}

tabs.forEach((tab) =>
  tab.addEventListener('click', () => {
    requestPeriod(tab.dataset.period as StockChartPeriod);
  })
);

window.addEventListener('message', (event: MessageEvent<StockChartResponseMessage>) => {
  const message = event.data;
  if (!message || message.period !== currentPeriod) return;
  if (message.type === 'chartError' || !message.data) {
    setLoading(message.message || '行情数据加载失败', true);
    return;
  }
  render(message.data);
});

chart.subscribeCrosshairMove((param) => {
  if (!param.time || !mainSeries) {
    legend.textContent = '';
    return;
  }
  const value: any = param.seriesData.get(mainSeries);
  if (!value) return;
  if ('open' in value) {
    legend.textContent = `开 ${value.open.toFixed(2)}  高 ${value.high.toFixed(
      2
    )}  低 ${value.low.toFixed(2)}  收 ${value.close.toFixed(2)}`;
  } else {
    legend.textContent = `价格 ${value.value.toFixed(2)}`;
  }
});

requestPeriod('trend');
