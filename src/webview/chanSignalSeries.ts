import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import {
  customSeriesDefaultOptions,
  CustomSeriesOptions,
  CustomSeriesWhitespaceData,
  ICustomSeriesPaneRenderer,
  ICustomSeriesPaneView,
  PaneRendererCustomData,
  Time,
} from 'lightweight-charts';
import { ChanSignalLevel } from '../chan/engine';
import { ChanSignalSeriesData } from '../chan/seriesData';

export const CHAN_SIGNAL_COLORS: Record<ChanSignalLevel, string> = {
  1: '#f0c94d',
  2: '#52a8e8',
  3: '#d982d9',
};

class ChanSignalRenderer implements ICustomSeriesPaneRenderer {
  private data?: PaneRendererCustomData<Time, ChanSignalSeriesData>;

  update(data: PaneRendererCustomData<Time, ChanSignalSeriesData>): void {
    this.data = data;
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (!this.data) return;
    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      const rowHeight = mediaSize.height / 3;
      context.save();
      context.font = '10px Consolas, "Microsoft YaHei", monospace';
      context.textBaseline = 'middle';
      context.fillStyle = '#626873';
      context.strokeStyle = '#24272d';
      context.lineWidth = 1;
      for (let row = 1; row < 3; row += 1) {
        const y = Math.round(rowHeight * row) + 0.5;
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(mediaSize.width, y);
        context.stroke();
      }
      ['一类', '二类', '三类'].forEach((label, index) => {
        context.fillText(label, 6, rowHeight * (index + 0.5));
      });

      const range = this.data!.visibleRange;
      const from = range ? Math.max(0, Math.floor(range.from)) : 0;
      const to = range ? Math.min(this.data!.bars.length, Math.ceil(range.to)) : this.data!.bars.length;
      for (let index = from; index < to; index += 1) {
        const bar = this.data!.bars[index];
        if (bar.x < 0 || bar.x > mediaSize.width) continue;
        bar.originalData.signals.forEach((signal) => {
          const centerY = rowHeight * (signal.level - 0.5);
          const size = 6;
          const apexY = signal.side === 'buy' ? centerY - size : centerY + size;
          const baseY = signal.side === 'buy' ? centerY + size : centerY - size;
          context.beginPath();
          context.moveTo(bar.x, apexY);
          context.lineTo(bar.x - size, baseY);
          context.lineTo(bar.x + size, baseY);
          context.closePath();
          context.strokeStyle = CHAN_SIGNAL_COLORS[signal.level];
          context.lineWidth = 1.5;
          context.stroke();
        });
      }
      context.restore();
    });
  }
}

export class ChanSignalPaneView implements ICustomSeriesPaneView<Time, ChanSignalSeriesData> {
  private readonly paneRenderer = new ChanSignalRenderer();

  renderer(): ICustomSeriesPaneRenderer {
    return this.paneRenderer;
  }

  update(data: PaneRendererCustomData<Time, ChanSignalSeriesData>): void {
    this.paneRenderer.update(data);
  }

  priceValueBuilder(): number[] {
    return [3, 1, 2];
  }

  isWhitespace(
    data: ChanSignalSeriesData | CustomSeriesWhitespaceData<Time>
  ): data is CustomSeriesWhitespaceData<Time> {
    return !('signals' in data);
  }

  defaultOptions(): CustomSeriesOptions {
    return {
      ...customSeriesDefaultOptions,
      color: CHAN_SIGNAL_COLORS[1],
      lastValueVisible: false,
      priceLineVisible: false,
    };
  }
}
