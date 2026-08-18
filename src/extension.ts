/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable jsdoc/require-jsdoc */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import * as vscode from 'vscode';
import { AdditionalDefinitionProvider } from './definition-provider';
import { addStatusBarCommand, showSettingsUpdateDialog } from './settings';
import { opensInPeekCommand } from './commands/open-in-peek/open-in-peek-command';
import { createResourceFromTextCommand } from './commands/create-resource/create-resource-command';

/**
 * Попытаться активировать расширение ms-dotnettools.csharp.
 * @param logger Логгер.
 * @returns Признак успешности активации.
 */
async function tryActivateCSharpExtension(logger: vscode.LogOutputChannel): Promise<boolean> {
  const dependencyId = 'ms-dotnettools.csharp';

  const csharpExtension = vscode.extensions.getExtension(dependencyId);
  if (!csharpExtension) {
    throw new Error(`Failed to find installation of '${dependencyId}'`);
  }

  await csharpExtension.activate();
  await csharpExtension.exports.initializationFinished();
  logger.info('ms-dotnettools.csharp activated');
  return true;
}

export async function activate(context: vscode.ExtensionContext) {
  const logger = vscode.window.createOutputChannel('development-studio-vscode-extension', { log: true });
  context.subscriptions.push(logger);

  if (!(await tryActivateCSharpExtension(logger))) return;
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

  const disposableCreateResourceCommand = vscode.commands.registerCommand('sungero.createResourceFromText', () => {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      createResourceFromTextCommand(activeEditor, context);
    }
  });
  context.subscriptions.push(disposableCreateResourceCommand);

  await addStatusBarCommand(context);
}

export function deactivate() {}
