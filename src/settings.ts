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

/**
 * Добавить в статус бар команду со сменой настройки языка ресурсных файлов.
 * @param context Контекст расширения.
 */
export async function addStatusBarCommand(context: vscode.ExtensionContext) {
  const changeLanguageCommand = 'sungero.changeLanguage';
  const configSection = 'sungero';
  const configKey = 'resourseLanguageDefault';
  const settingName = `${configSection}.${configKey}`;

  /**
   * Актуализировать отображаемое значение в статус баре.
   * @param statusBarItem Элемент строки состояния.
   */
  function updateStatusBarItem(statusBarItem: vscode.StatusBarItem): void {
    const setting = vscode.workspace.getConfiguration().get<string>(settingName);
    statusBarItem.text = `DS (${setting !== 'en' ? setting : ''}.resx)`;
    statusBarItem.show();
  }

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = changeLanguageCommand;
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(settingName)) {
        updateStatusBarItem(statusBarItem);
      }
    }),
  );

  updateStatusBarItem(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand(changeLanguageCommand, async () => {
      const sungeroConfig = vscode.workspace.getConfiguration(configSection);
      const settingValue = sungeroConfig.get<string>(configKey);

      const quickPick = await vscode.window.showQuickPick(
        ['en', 'ru' ],
        {
          canPickMany: false,
          placeHolder: 'Select default language for resources show',
        },
      );
      if (quickPick && quickPick !== settingValue) {
        await sungeroConfig.update(configKey, quickPick, true);
      }
    }),
  );
}
