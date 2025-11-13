import * as vscode from 'vscode';
import { AdditionalDefinitionProvider, resourcesOpensInPeekCommand } from './definition-provider';
import { addStatusBarCommand, showSettingsUpdateDialog } from './settings';

/**
 * Подождать пока активируется расширение ms-dotnettools.csharp.
 */
async function waitCSharpExtensionActivate() {
  const csharpExtension = vscode.extensions.getExtension('ms-dotnettools.csharp');
  if (!csharpExtension) {
    throw new Error('Failed to find installation of ms-dotnettools.csharp');
  }
  await csharpExtension.activate();
  await csharpExtension.exports.initializationFinished();
  console.log('ms-dotnettools.csharp activated');
}

export async function activate(context: vscode.ExtensionContext) {
  await waitCSharpExtensionActivate();

  showSettingsUpdateDialog(context);

  const disposable = vscode.languages.registerDefinitionProvider(
    { language: 'csharp', scheme: 'file' },
    new AdditionalDefinitionProvider(),
  );
  context.subscriptions.push(disposable);

  const disposableCommand = vscode.commands.registerCommand('sungero.resourcesOpensInPeek', () => {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      resourcesOpensInPeekCommand(activeEditor.document, activeEditor.selection.active);
    }
  });
  context.subscriptions.push(disposableCommand);

  await addStatusBarCommand(context);
}

export function deactivate() {}









 