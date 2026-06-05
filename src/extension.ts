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
 * Попытаться активировать расширение ms-dotnettools.csharp.
 * @returns Признак успешности активации.
 */
async function tryActivateCSharpExtension(): Promise<boolean> {
  const dependencyId = 'ms-dotnettools.csharp';

  const csharpExtension = vscode.extensions.getExtension(dependencyId);
  if (!csharpExtension) {
    throw new Error(`Failed to find installation of '${dependencyId}'`);
  }

  await csharpExtension.activate();
  await csharpExtension.exports.initializationFinished();
  console.log('ms-dotnettools.csharp activated');
  return true;
}

export async function activate(context: vscode.ExtensionContext) {
  if (!(await tryActivateCSharpExtension())) return;
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
