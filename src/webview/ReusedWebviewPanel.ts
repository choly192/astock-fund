import { ViewColumn, WebviewOptions, WebviewPanel, WebviewPanelOptions, window } from 'vscode';

const panels = new Map<string, WebviewPanel>();

export function createReusedWebviewPanel(
  viewType: string,
  title: string,
  showOptions = ViewColumn.Active,
  options?: WebviewPanelOptions & WebviewOptions
): WebviewPanel {
  const existing = panels.get(viewType);
  if (existing) {
    existing.title = title;
    existing.reveal();
    return existing;
  }

  const panel = window.createWebviewPanel(viewType, title, showOptions, options);
  panel.onDidDispose(() => panels.delete(viewType));
  panels.set(viewType, panel);
  return panel;
}

