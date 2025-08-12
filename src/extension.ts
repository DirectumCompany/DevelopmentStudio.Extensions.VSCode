import * as vscode from 'vscode';
import { AdditionalDefinitionProvider } from './definition-provider';

export function activate(context: vscode.ExtensionContext) {
  if (vscode.workspace.getConfiguration('sungero').get('enableAdditionalDefinitionProvider')) {
    const disposable = vscode.languages.registerDefinitionProvider('csharp', new AdditionalDefinitionProvider());
    context.subscriptions.push(disposable);
  }

  const command = 'development-studio-vscode-extension.GoToOriginalDefinition';
  const additionalDefinintionProvider = new AdditionalDefinitionProvider();
  const commandHandler = () => {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      return;
    }
    additionalDefinintionProvider.provideDefinitionCommand(activeEditor.document, activeEditor.selection.active);
  };
  context.subscriptions.push(vscode.commands.registerCommand(command, commandHandler));
}

export function deactivate() {} 

