import * as fs from 'fs';
import * as path from 'path';
import {
  ChanBacktestOptions,
  parseChanValidationDatasets,
  runChanValidation,
} from './validation';

interface CliOptions extends Partial<ChanBacktestOptions> {
  inputPath: string;
  outputPath?: string;
}

function usage(): string {
  return [
    'Usage:',
    '  npm run validate:chan -- <input.json> [output.json] [horizons] [fee-bps] [slippage-bps]',
    '  node out/chan/validationCli.js --input <data.json> [options]',
    '',
    'Options:',
    '  --output <report.json>       将报告写入文件；省略时输出到 stdout',
    '  --horizons <5,10,20>         持有 K 线数量',
    '  --fee-bps <3>                单边手续费（基点）',
    '  --slippage-bps <2>           单边滑点（基点）',
    '  --development-ratio <0.7>    按时间划分开发集的比例',
    '  --regime-ma-bars <60>        市场状态均线窗口',
    '  --regime-slope-bars <20>     市场状态均线斜率间隔',
    '  --regime-threshold <0.005>   趋势状态最小偏离比例',
  ].join('\n');
}

function readValue(args: readonly string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} 缺少参数`);
  return value;
}

export function parseCliOptions(args: readonly string[]): CliOptions {
  if (args.length && !args[0].startsWith('--')) {
    const [inputPath, rawOutputPath, rawHorizons, rawFeeBps, rawSlippageBps, ...rest] = args;
    if (rest.length) throw new Error(`位置参数过多\n${usage()}`);
    return {
      inputPath,
      outputPath: rawOutputPath && rawOutputPath !== '-' ? rawOutputPath : undefined,
      horizons: rawHorizons ? rawHorizons.split(',').map(Number) : undefined,
      feeBps: rawFeeBps === undefined ? undefined : Number(rawFeeBps),
      slippageBps: rawSlippageBps === undefined ? undefined : Number(rawSlippageBps),
    };
  }
  let inputPath: string | undefined;
  let outputPath: string | undefined;
  let horizons: number[] | undefined;
  let feeBps: number | undefined;
  let slippageBps: number | undefined;
  let developmentRatio: number | undefined;
  let regimeMaBars: number | undefined;
  let regimeSlopeBars: number | undefined;
  let regimeThreshold: number | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--help' || flag === '-h') throw new Error(usage());
    const value = readValue(args, index, flag);
    index += 1;
    if (flag === '--input') inputPath = value;
    else if (flag === '--output') outputPath = value;
    else if (flag === '--horizons') horizons = value.split(',').map(Number);
    else if (flag === '--fee-bps') feeBps = Number(value);
    else if (flag === '--slippage-bps') slippageBps = Number(value);
    else if (flag === '--development-ratio') developmentRatio = Number(value);
    else if (flag === '--regime-ma-bars') regimeMaBars = Number(value);
    else if (flag === '--regime-slope-bars') regimeSlopeBars = Number(value);
    else if (flag === '--regime-threshold') regimeThreshold = Number(value);
    else throw new Error(`未知参数：${flag}\n${usage()}`);
  }
  if (!inputPath) throw new Error(`缺少 --input\n${usage()}`);
  return {
    inputPath,
    outputPath,
    horizons,
    feeBps,
    slippageBps,
    developmentRatio,
    regimeMaBars,
    regimeSlopeBars,
    regimeThreshold,
  };
}

export function runCli(args: readonly string[]): void {
  const options = parseCliOptions(args);
  const inputPath = path.resolve(options.inputPath);
  const value = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as unknown;
  const datasets = parseChanValidationDatasets(value);
  const report = runChanValidation(datasets, {
    horizons: options.horizons,
    feeBps: options.feeBps,
    slippageBps: options.slippageBps,
    developmentRatio: options.developmentRatio,
    regimeMaBars: options.regimeMaBars,
    regimeSlopeBars: options.regimeSlopeBars,
    regimeThreshold: options.regimeThreshold,
  });
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (options.outputPath) {
    const outputPath = path.resolve(options.outputPath);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, output, 'utf8');
    process.stdout.write(`缠论验证报告已写入 ${outputPath}\n`);
    return;
  }
  process.stdout.write(output);
}

if (require.main === module) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
