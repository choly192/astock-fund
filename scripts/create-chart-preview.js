const fs = require('fs');
const path = require('path');
const Module = require('module');

class MockTreeItem {}
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') {
    return {
      TreeItem: MockTreeItem,
      TreeItemCollapsibleState: { None: 0, Expanded: 2 },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { getStockTrendHtml } = require('../out/webview/stockTrendHtml');
const html = getStockTrendHtml(
  {
    code: 'sh600519',
    name: '贵州茅台',
    price: '1488.88',
    percent: '1.26',
    updown: '18.52',
    open: '1470.00',
    high: '1495.20',
    low: '1462.30',
    yestclose: '1470.36',
    volume: '3.52万',
    amount: '52.18亿',
    time: '2026-08-18 15:00:00',
    fetchedAt: Date.now(),
    source: '腾讯财经',
  },
  '/dist/stockChart.js',
  'http://127.0.0.1:4173'
);

const outputDirectory = path.resolve(__dirname, '../.chart-preview');
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, 'index.html'), html, 'utf8');
console.log(path.join(outputDirectory, 'index.html'));
