const path = require('path');
const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');
const common = {
  bundle: true,
  sourcemap: false,
  minify: true,
  legalComments: 'none',
  logLevel: 'info',
};
const builds = [
  {
    ...common,
    entryPoints: [path.resolve(__dirname, '../src/extension.ts')],
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    target: 'node16',
    outfile: path.resolve(__dirname, '../dist/extension.js'),
  },
  {
    ...common,
    entryPoints: [path.resolve(__dirname, '../src/webview/stockChartClient.ts')],
    format: 'iife',
    platform: 'browser',
    target: 'chrome90',
    outfile: path.resolve(__dirname, '../dist/stockChart.js'),
  },
];

async function main() {
  if (watch) {
    const contexts = await Promise.all(builds.map((options) => esbuild.context(options)));
    await Promise.all(contexts.map((context) => context.watch()));
    return;
  }
  await Promise.all(builds.map((options) => esbuild.build(options)));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
