import * as vscode from 'vscode';
import { AdditionalDefinitionProvaider } from './definition-provider';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.languages.registerDefinitionProvider(
    'csharp', 
	new AdditionalDefinitionProvaider()
  );
  context.subscriptions.push(disposable);
}

export function deactivate() {} 
