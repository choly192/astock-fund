import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';

const projectRoot = path.resolve(__dirname, '../../..');
const releaseScript = path.join(projectRoot, 'scripts', 'extract-release-notes.js');
const manifest = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
);

suite('GitHub release metadata', () => {
  test('extracts notes for the package version only', () => {
    const outputPath = path.join(
      os.tmpdir(),
      `stock-eagle-eye-release-notes-${process.pid}.md`
    );

    try {
      const result = spawnSync(
        process.execPath,
        [releaseScript, `v${manifest.version}`, outputPath],
        { cwd: projectRoot, encoding: 'utf8' }
      );

      assert.equal(result.status, 0, result.stderr);
      const notes = fs.readFileSync(outputPath, 'utf8');
      assert.ok(notes.trim());
      assert.ok(!/^##\s+/m.test(notes));
    } finally {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }
  });

  test('rejects a tag that differs from the package version', () => {
    const result = spawnSync(
      process.execPath,
      [releaseScript, 'v0.0.0', path.join(os.tmpdir(), 'unused-release-notes.md')],
      { cwd: projectRoot, encoding: 'utf8' }
    );

    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes('does not match package.json version'));
  });
});
