import * as vscode from 'vscode';
import { AdditionalDefinitionProvider } from './definition-provider';

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

/**
 * Показать диалог с предложением смены настройки.
 * @param context Контекст.
 */
async function showSettingsUpdateDialog(context: vscode.ExtensionContext) {
  const settingName = 'editor.gotoLocation.multipleDefinitions';
  const recommendedValue = 'goto';

  if (vscode.workspace.getConfiguration().get(settingName) === recommendedValue) {
    return;
  }

  const okValue = 'OK';
  const cancelValue = 'Не сейчас';
  const extensionDescription = context.extension.packageJSON.description;
  const choose = await vscode.window.showInformationMessage(
    [
      `[${extensionDescription}]`,
      `Для автоматического перехода на "оригинальное" определение рекомендуется задать "${settingName}": "${recommendedValue}".`,
      `Нажмите "${okValue}" для установки указанного значения.`,
    ].join('\n'),
    okValue,
    cancelValue,
  );
  if (choose === okValue) {
    vscode.workspace.getConfiguration().update(settingName, recommendedValue, true);
    vscode.window.showInformationMessage(
      `[${extensionDescription}] Параметру "${settingName}" задано значение "${recommendedValue}".`,
    );
  }
}

export async function activate(context: vscode.ExtensionContext) {
  await waitCSharpExtensionActivate();
  showSettingsUpdateDialog(context);
  const disposable = vscode.languages.registerDefinitionProvider(
    { language: 'csharp', scheme: 'file' },
    new AdditionalDefinitionProvider(),
  );
  context.subscriptions.push(disposable);
}

export function deactivate() {} 

