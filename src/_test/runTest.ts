import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { runTests } from '@vscode/test-electron';

async function main() {
  const userDataPath = fs.mkdtempSync(
    path.join(os.tmpdir(), 'stock-eagle-eye-vscode-test-'),
  );

  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // The path to test runner
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    const vscodeExecutablePath = process.env.VSCODE_EXECUTABLE_PATH;

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      // Keep runtime sockets outside the repository so VSCE can scan it after tests.
      launchArgs: [`--user-data-dir=${userDataPath}`],
      ...(vscodeExecutablePath ? { vscodeExecutablePath } : {}),
    });
  } catch (err) {
    console.error('Failed to run tests', err);
    process.exitCode = 1;
  } finally {
    try {
      fs.rmSync(userDataPath, { recursive: true, force: true });
    } catch {
      // VS Code helper processes can briefly retain Windows endpoint handles.
    }
  }
}

main();
