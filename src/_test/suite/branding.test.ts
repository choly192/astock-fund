import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const projectRoot = path.resolve(__dirname, '../../..');
const manifestPath = path.join(projectRoot, 'package.json');

function getTextFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return getTextFiles(fullPath);
    return /\.(json|md|ts|svg)$/.test(entry.name) ? [fullPath] : [];
  });
}

suite('Brand manifest', () => {
  test('uses the new project identity and initial version', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.equal(manifest.name, 'stock-eagle-eye');
    assert.equal(manifest.displayName, 'stock-eagle-eye');
    assert.equal(manifest.publisher, 'stock-eagle-eye');
    assert.equal(manifest.version, '1.0.0');
    assert.ok(fs.existsSync(path.join(projectRoot, manifest.icon)));
  });

  test('builds a self-contained runtime bundle', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const bundlePath = path.join(projectRoot, manifest.main);
    const chartBundlePath = path.join(projectRoot, 'dist', 'stockChart.js');
    const bundle = fs.readFileSync(bundlePath, 'utf8');

    assert.equal(manifest.main, './dist/extension.js');
    assert.ok(fs.existsSync(chartBundlePath));
    assert.ok(manifest.scripts.package.includes('--no-dependencies'));
    assert.ok(!/require\(["'](?:axios|moment|moment-timezone|iconv-lite)["']\)/.test(bundle));
  });

  test('registers every view under an existing container', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const containers = new Set(
      manifest.contributes.viewsContainers.activitybar.map(
        (container: { id: string }) => container.id
      )
    );

    Object.keys(manifest.contributes.views).forEach((containerId) => {
      assert.ok(containers.has(containerId), `Missing view container: ${containerId}`);
      manifest.contributes.views[containerId].forEach((view: { id: string }) => {
        assert.ok(
          manifest.activationEvents.includes(`onView:${view.id}`),
          `Missing activation event for view: ${view.id}`
        );
      });
    });
  });

  test('registers every contributed menu command', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const commands = new Set(
      manifest.contributes.commands.map((item: { command: string }) => item.command)
    );
    Object.values(manifest.contributes.menus).forEach((menu: any) => {
      menu.forEach((item: { command: string }) => {
        assert.ok(commands.has(item.command), `Missing command contribution: ${item.command}`);
      });
    });
  });

  test('contains no legacy product branding outside the required license', () => {
    const oldProduct = `${'lee'}${'k'}[-_ ]?${'fu'}${'nd'}`;
    const oldOrganization = `${'lee'}${'k'}${'hub'}`;
    const oldPublisher = `${'gis'}${'cafer'}`;
    const legacyBrand = new RegExp(
      `${oldProduct}|${oldOrganization}|${oldPublisher}`,
      'i'
    );
    const files = [
      manifestPath,
      path.join(projectRoot, 'package-lock.json'),
      path.join(projectRoot, 'README.md'),
      path.join(projectRoot, 'CHANGELOG.md'),
      ...getTextFiles(path.join(projectRoot, 'src')),
      ...getTextFiles(path.join(projectRoot, '.github')),
      ...getTextFiles(path.join(projectRoot, 'resources')),
    ];

    files.forEach((file) => {
      const content = fs.readFileSync(file, 'utf8');
      assert.ok(!legacyBrand.test(content), file);
    });
  });
});
