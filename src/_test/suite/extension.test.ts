import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
  test('activates and registers core refresh commands', async () => {
    const extension = vscode.extensions.getExtension('stock-eagle-eye.stock-eagle-eye');
    assert.ok(extension, 'Extension was not discovered by the extension host');
    await extension!.activate();
    assert.equal(extension!.isActive, true);

    const registered = await vscode.commands.getCommands(true);
    assert.ok(registered.includes('stock-eagle-eye.refreshStock'));
    assert.ok(registered.includes('stock-eagle-eye.refreshFund'));
  });
});
