import * as vscode from 'vscode';
import { AdditionalDefinitionProvider } from './definition-provider';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.languages.registerDefinitionProvider('csharp', new AdditionalDefinitionProvider());
  context.subscriptions.push(disposable);
}

export function deactivate() {} 

