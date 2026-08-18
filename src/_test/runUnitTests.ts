import * as path from 'path';
import * as Module from 'module';
import * as glob from 'glob';
import * as Mocha from 'mocha';

class MockTreeItem {
  label?: string;
  collapsibleState?: number;

  constructor(label?: string, collapsibleState?: number) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

const vscodeMock = {
  commands: {
    getCommands: async () => [
      'stock-eagle-eye.refreshStock',
      'stock-eagle-eye.refreshFund',
    ],
  },
  ConfigurationTarget: { Global: 1 },
  extensions: {
    getExtension: (id: string) => id === 'stock-eagle-eye.stock-eagle-eye'
      ? { isActive: true, activate: async () => undefined }
      : undefined,
  },
  TreeItem: MockTreeItem,
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  window: {
    showErrorMessage: () => undefined,
    showInformationMessage: () => undefined,
  },
  workspace: {
    getConfiguration: () => ({
      get: (_key: string, fallback: unknown) => fallback,
      update: () => Promise.resolve(),
    }),
  },
};

const nodeModule = Module as any;
const originalLoad = nodeModule._load;
nodeModule._load = function(request: string, parent: unknown, isMain: boolean) {
  if (request === 'vscode') return vscodeMock;
  return originalLoad.call(this, request, parent, isMain);
};

const mocha = new Mocha({ ui: 'tdd', color: true });
const testsRoot = path.resolve(__dirname, 'suite');
glob.sync('**/*.test.js', { cwd: testsRoot }).forEach((file) => {
  mocha.addFile(path.resolve(testsRoot, file));
});

mocha.run((failures) => {
  nodeModule._load = originalLoad;
  process.exitCode = failures ? 1 : 0;
});
