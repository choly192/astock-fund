import * as assert from 'assert';
import { parseTencentStockResponse } from '../../shared/tencentStock';

function quote(name: string, code: string): string {
  const fields = new Array(38).fill('');
  fields[1] = name;
  fields[2] = code;
  fields[3] = '101.20';
  fields[4] = '100.00';
  fields[5] = '99.80';
  fields[30] = '20260818150000';
  fields[33] = '102.00';
  fields[34] = '98.50';
  fields[36] = '123456';
  fields[37] = '789000';
  return fields.join('~');
}

suite('Tencent stock quote parsing', () => {
  test('maps mainland and US source identifiers back to configured codes', () => {
    const response = `v_sh600519="${quote('贵州茅台', '600519')}";\n` +
      `v_usNVDA="${quote('英伟达', 'NVDA')}";`;
    const parsed = parseTencentStockResponse(response, ['sh600519', 'usr_nvda']);
    assert.equal(parsed[0].name, '贵州茅台');
    assert.equal(parsed[0].price, '101.20');
    assert.equal(parsed[1].code, 'usr_nvda');
    assert.equal(parsed[1].name, '英伟达');
  });

  test('returns NODATA for missing symbols', () => {
    assert.deepStrictEqual(parseTencentStockResponse('', ['sz000001']), [
      { code: 'sz000001', name: 'NODATA' },
    ]);
  });
});
