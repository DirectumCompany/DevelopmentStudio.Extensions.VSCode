import * as vscode from 'vscode';

/** Детальное описание элемента. */
export type ElementDetail = {
  container: vscode.DocumentSymbol;
  parent: string;
  uri: vscode.Uri;
  textLine?: string;
  isInjection?: boolean;
};
