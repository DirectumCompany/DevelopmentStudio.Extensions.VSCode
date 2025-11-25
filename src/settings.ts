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
  const changeDSSettingsCommand = 'sungero.changeDSSettings';
  const configSection = 'sungero';
  const resourceConfigKey = 'resourseLanguageDefault';
  const queryTypeConfigKey = 'queryTypeDefault';
  const resourceSettingName = `${configSection}.${resourceConfigKey}`;
  const queryTypeSettingName = `${configSection}.${queryTypeConfigKey}`;

  /**
   * Актуализировать отображаемое значение в статус баре.
   * @param statusBarItem Элемент строки состояния.
   */
  function updateStatusBarItem(statusBarItem: vscode.StatusBarItem): void {
    const resourceSettingValue = vscode.workspace.getConfiguration().get<string>(resourceSettingName);
    const queryTypeSettingValue = vscode.workspace.getConfiguration().get<string>(queryTypeSettingName);
    statusBarItem.text = `DS (${
      resourceSettingValue !== 'en' ? resourceSettingValue : ''
    }.resx, .${queryTypeSettingValue}.sql)`;
    statusBarItem.show();
  }

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = changeDSSettingsCommand;
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(resourceSettingName) || e.affectsConfiguration(queryTypeSettingName)) {
        updateStatusBarItem(statusBarItem);
      }
    }),
  );

  updateStatusBarItem(statusBarItem);

  context.subscriptions.push(vscode.commands.registerCommand(changeDSSettingsCommand, changeSettings));

  /**
   * Изменить настройки.
   */
  async function changeSettings() {
    interface SettingItem extends vscode.QuickPickItem {
      label: string;
      setting: { items: vscode.QuickPickItem[]; placeHolder: string; settingName: string };
    }

    const changeSelectSettings = async (setting: {
      items: vscode.QuickPickItem[];
      placeHolder: string;
      settingName: string;
    }): Promise<void> => {
      const currentValue: vscode.QuickPickItem = {
        label: vscode.workspace.getConfiguration().get<string>(setting.settingName)!,
      };
      const choice = await vscode.window.showQuickPick<vscode.QuickPickItem>(setting.items, {
        canPickMany: false,
        placeHolder: setting.placeHolder,
      });
      if (choice && choice !== currentValue) {
        await vscode.workspace.getConfiguration().update(setting.settingName, choice.label, true);
      }
    };

    let picks: SettingItem[] = [];
    const configurateResourceLanguageSettings: SettingItem = {
      label: 'Configure resource language',
      setting: {
        items: [{ label: 'en' }, { label: 'ru' }],
        placeHolder: 'Select default language for resources show',
        settingName: resourceSettingName,
      },
    };
    picks.push(configurateResourceLanguageSettings);
    const configurateQueryTypeSettings: SettingItem = {
      label: 'Configure query type',
      setting: {
        items: [{ label: 'postgresql' }, { label: 'mssql' }],
        placeHolder: 'Select default query type',
        settingName: queryTypeSettingName,
      },
    };
    picks.push(configurateQueryTypeSettings);

    const quickPick = await vscode.window.showQuickPick<SettingItem>(picks, {
      canPickMany: false,
      placeHolder: 'Select Action',
    });
    if (quickPick) {
      await changeSelectSettings(quickPick.setting);
    }
  }
}
