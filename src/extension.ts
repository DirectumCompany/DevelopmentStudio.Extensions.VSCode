/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable jsdoc/require-jsdoc */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import * as vscode from 'vscode';
import { AdditionalDefinitionProvider, opensInPeekCommand } from './definition-provider';
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

  const disposableCommand = vscode.commands.registerCommand('sungero.opensInPeek', () => {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      opensInPeekCommand(activeEditor.document, activeEditor.selection.active);
    }
  });
  context.subscriptions.push(disposableCommand);

  await addStatusBarCommand(context);
}

export function deactivate() {}
