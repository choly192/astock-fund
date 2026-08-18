export interface EastMoneyStockTarget {
  market: 0 | 1 | 105 | 116;
  symbol: string;
  secid: string;
  url: string;
}

export function getEastMoneyStockTarget(rawCode: string): EastMoneyStockTarget {
  const code = rawCode.trim().toLowerCase();
  let market: EastMoneyStockTarget['market'];
  let symbol: string;
  if (code.startsWith('sh')) {
    market = 1;
    symbol = code.slice(2);
  } else if (code.startsWith('sz') || code.startsWith('bj')) {
    market = 0;
    symbol = code.slice(2);
  } else if (code.startsWith('hk')) {
    market = 116;
    symbol = code.slice(2);
  } else if (code.startsWith('usr_')) {
    market = 105;
    symbol = code.slice(4).toUpperCase();
  } else if (code.startsWith('gb_')) {
    market = 105;
    symbol = code.slice(3).toUpperCase();
  } else {
    throw new Error(`不支持的股票代码：${rawCode}`);
  }
  if (!/^[a-z0-9.]+$/i.test(symbol)) throw new Error(`无效的股票代码：${rawCode}`);
  return {
    market,
    symbol,
    secid: `${market}.${symbol}`,
    url: `https://quote.eastmoney.com/basic/full.html?mcid=${market}.${encodeURIComponent(symbol)}`,
  };
}
