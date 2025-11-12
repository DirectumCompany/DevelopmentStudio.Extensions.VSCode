import * as vscode from 'vscode';

/**
 * Показать диалог с предложением смены настройки.
 * @param context Контекст.
 */
export async function showSettingsUpdateDialog(context: vscode.ExtensionContext) {
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
