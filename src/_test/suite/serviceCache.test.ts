import * as assert from 'assert';
import FundService from '../../explorer/fundService';
import StockService from '../../explorer/stockService';
import { FundInfo, StockInfo } from '../../shared/typed';

function createContext(cache: Record<string, unknown>): any {
  return {
    asAbsolutePath: (value: string) => value,
    globalState: {
      get: (key: string, fallback: unknown) => cache[key] ?? fallback,
      update: async (key: string, value: unknown) => { cache[key] = value; },
    },
  };
}

suite('Quote cache and cancellation', () => {
  test('uses the last stock quote when the upstream request fails', async () => {
    const cached: StockInfo = {
      code: 'sh000001', name: '上证指数', price: '3600.00', percent: '0.20', type: 'sh',
    };
    const service = new StockService(createContext({
      'stock-eagle-eye.stockQuoteCache': [cached],
    }));
    (service as any).getSinaStockData = async () => [];
    (service as any).getHKStockData = async () => [];
    const result = await service.getData(['sh000001']);
    assert.equal(result[0].info.price, '3600.00');
    assert.equal(result[0].info.stale, true);
  });

  test('preserves quotes from closed markets during a partial refresh', async () => {
    const mainland: StockInfo = {
      code: 'sh000001', name: '上证指数', price: '3600.00', percent: '0.20', type: 'sh',
    };
    const us: StockInfo = {
      code: 'usr_nvda', name: '英伟达', price: '180.00', percent: '1.20', type: 'usr_',
    };
    const service = new StockService(createContext({
      'stock-eagle-eye.stockQuoteCache': [mainland, us],
    }));
    (service as any).getSinaStockData = async () => [];
    (service as any).getHKStockData = async () => [];

    const result = await service.getData(['sh000001'], true);
    assert.deepStrictEqual(
      result.map((item) => item.info.code).sort(),
      ['sh000001', 'usr_nvda']
    );
  });

  test('batches large stock requests', async () => {
    const service = new StockService(createContext({}));
    const batchSizes: number[] = [];
    (service as any).getSinaStockBatch = async (codes: string[]) => {
      batchSizes.push(codes.length);
      return [];
    };
    (service as any).getHKStockData = async () => [];
    const codes = Array.from({ length: 165 }, (_item, index) =>
      `sh${String(index).padStart(6, '0')}`
    );

    await service.getData(codes);
    assert.deepStrictEqual(batchSizes.sort((a, b) => b - a), [80, 80, 5]);
  });

  test('uses the last fund quote when the upstream request fails', async () => {
    const cached: FundInfo = {
      code: '110022', name: '测试基金', netValue: '2.5000', percent: '1.20', type: 'fund',
    };
    const service = new FundService(createContext({
      'stock-eagle-eye.fundQuoteCache': [cached],
    }));
    (service as any).getFundInfo = async () => { throw new Error('offline'); };
    const result = await service.getData(['110022']);
    assert.equal(result[0].info.netValue, '2.5000');
    assert.equal(result[0].info.stale, true);
  });

  test('does not start searches that were already canceled', async () => {
    const controller = new AbortController();
    controller.abort();
    const context = createContext({});
    assert.deepStrictEqual(await new StockService(context).getStockSuggestList('600519', controller.signal), []);
    assert.deepStrictEqual(await new FundService(context).getFundSuggestList('110022', controller.signal), []);
  });
});
