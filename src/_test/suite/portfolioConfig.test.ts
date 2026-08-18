import * as assert from 'assert';
import { createPortfolioFile, parsePortfolioFile } from '../../shared/portfolioConfig';

suite('Portfolio import and export', () => {
  test('round-trips stock and fund groups', () => {
    const stocks = { names: ['指数', '海外'], lists: [['sh000001'], ['usr_nvda']] };
    const funds = { names: ['基金'], lists: [['110022']] };
    assert.deepStrictEqual(parsePortfolioFile(createPortfolioFile(stocks, funds)), {
      stocks,
      funds,
    });
  });

  test('rejects unsupported versions and invalid codes', () => {
    assert.throws(() => parsePortfolioFile('{"formatVersion":2}'), /不支持/);
    assert.throws(() => parsePortfolioFile(JSON.stringify({
      formatVersion: 1,
      stockGroups: [{ name: '股票', codes: ['600519'] }],
      fundGroups: [],
    })), /无效代码/);
  });
});
