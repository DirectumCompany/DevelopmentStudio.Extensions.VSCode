/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable jsdoc/require-jsdoc */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import * as vscode from 'vscode';
import { AdditionalCodeLensProvider } from './code-lens-provider';
import { AdditionalDefinitionProvider } from './definition-provider';
import { AdditionalReferenceProvider } from './reference-provider';
import { addStatusBarCommand, showSettingsUpdateDialog } from './settings';
import { opensInPeekCommand } from './commands/open-in-peek/open-in-peek-command';
import { createResourceFromTextCommand } from './commands/create-resource/create-resource-command';

/**
 * Активировать расширение ms-dotnettools.csharp и дождаться окончания его инициализации.
 * @param logger Логгер.
 */
async function activateCSharpExtension(logger: vscode.LogOutputChannel): Promise<void> {
  const dependencyId = 'ms-dotnettools.csharp';

  const csharpExtension = vscode.extensions.getExtension(dependencyId);
  if (!csharpExtension) {
    throw new Error(`Failed to find installation of '${dependencyId}'`);
  }

  await csharpExtension.activate();
  logger.info('ms-dotnettools.csharp activated');
  await csharpExtension.exports.initializationFinished();
  logger.info('ms-dotnettools.csharp initializationFinished');
}

export async function activate(context: vscode.ExtensionContext) {
  const logger = vscode.window.createOutputChannel('development-studio-vscode-extension', { log: true });
  context.subscriptions.push(logger);

  try {
    await activateCSharpExtension(logger);
  } catch (error: unknown) {
    logger.error(`Failed to activate ms-dotnettools.csharp: ${String(error)}`);
    return;
  }

  const codeLensProvider = new AdditionalCodeLensProvider(logger);
  context.subscriptions.push(
    codeLensProvider,
    vscode.languages.registerDefinitionProvider(
      { language: 'csharp', scheme: 'file' },
      new AdditionalDefinitionProvider(),
    ),
    vscode.languages.registerReferenceProvider(
      { language: 'csharp', scheme: 'file' },
      new AdditionalReferenceProvider(),
    ),
    vscode.languages.registerCodeLensProvider({ language: 'csharp', scheme: 'file' }, codeLensProvider),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.languageId === 'csharp') codeLensProvider.refreshReferences(document.uri);
    }),
    vscode.workspace.onDidCloseTextDocument((document) => codeLensProvider.clearDocumentReferences(document.uri)),
  );

  logger.info('The definition, link, and CodeLens providers are registered');

  showSettingsUpdateDialog(context);

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
