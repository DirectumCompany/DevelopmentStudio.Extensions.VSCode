import * as vscode from 'vscode';
import { IUpdateInfo, updateResourceFiles } from './update-resource-files';
import { IParsedFilePath } from './parsed-file-path';
import { getResourceFiles } from './get-resource-files';

/** Сообщение, приходящее из webview формы создания ресурса. */
interface IWebviewMessage {
  /** Команда, выбранная в форме. */
  command: string;
  /** Ключ создаваемого ресурса. */
  input: string;
  /** Значение ресурса для языка ru. */
  ru: string;
  /** Значение ресурса для языка en. */
  en: string;
}

/** Панель с webview. */
let currentPanel: vscode.WebviewPanel | undefined = undefined;

/**
 * Запустить диалог добавления ресурса.
 * @param context Контекст.
 * @param stringValue Значение строки, на которой вызвали команду.
 * @param parsedFilePath Данные, извлеченные из пути файла прикладной разработки.
 * @param afterResourceSavedFunc Функция, выполняющаяся после того, как значения в файлах будет заменено.
 * @param afterClose Функция, выполняющаяся после закрытия панели.
 */
export async function runResourceDialog(
  context: vscode.ExtensionContext,
  stringValue: string,
  parsedFilePath: IParsedFilePath,
  afterResourceSavedFunc: (key: string) => Promise<void>,
  afterClose: () => Promise<void>,
): Promise<void> {
  const resxFiles = await getResourceFiles(parsedFilePath);
  if (!resxFiles) {
    vscode.window.showWarningMessage('No resource files (*.resx) found.');
    return;
  }

  if (currentPanel) {
    currentPanel.reveal(currentPanel.viewColumn);
  } else {
    currentPanel = vscode.window.createWebviewPanel(
      'sungeroResource',
      'Create String Resource',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'media')],
      },
    );
    const cssUri = currentPanel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'dist', 'media', 'run-resource-dialog.css'),
    );
    const jsUri = currentPanel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'dist', 'media', 'run-resource-dialog.js'),
    );
    currentPanel.webview.html = getWebviewContent(cssUri, jsUri, stringValue, currentPanel.webview.cspSource);
    currentPanel.webview.onDidReceiveMessage(
      async (message: IWebviewMessage): Promise<void> => {
        switch (message.command) {
          case 'createResource': {
            const resourceKey = message.input;
            if (resourceKey) {
              const updateInfos: Array<IUpdateInfo> = [];
              updateInfos.push({ filePath: resxFiles.ru ?? '', value: message.ru });
              updateInfos.push({ filePath: resxFiles.en ?? '', value: message.en });

              try {
                await updateResourceFiles(resourceKey, updateInfos);
                await afterResourceSavedFunc(resourceKey);

                currentPanel?.dispose();
              } catch (err) {
                if (err !== null && typeof err === 'object' && 'message' in err) {
                  currentPanel?.webview.postMessage({
                    type: 'serverError',
                    errors: [err?.message],
                  });
                } else {
                  vscode.window.showErrorMessage(`${err as string}`);
                }
              }
            }
            return;
          }
          case 'cancel':
            currentPanel?.dispose();
            return;
        }
      },
      undefined,
      context.subscriptions,
    );
    currentPanel.onDidDispose(
      async () => {
        currentPanel = undefined;
        await afterClose();
      },
      undefined,
      context.subscriptions,
    );
  }
}

/**
 * Вернуть контент для webview.
 * @param cssUri Uri стилей webview.
 * @param jsUri Uri скрипта webview.
 * @param currentText Текущее значение строковой константы.
 * @param cspSource Источник для Content-Security-Policy.
 * @returns HTML-контент webview.
 */
function getWebviewContent(cssUri: vscode.Uri, jsUri: vscode.Uri, currentText: string, cspSource: string): string {
  const nonce = getNonce();

  const title = 'Create string resource';
  const saveButtonLanbel = '✓ Save';
  const saveButton = `<button class="create-resource" id="create-resource" disabled>${saveButtonLanbel}</button>`;
  const cancelButtonLanbel = '✕ Cancel';
  const cancelButton = `<button class="cancel-create-resource" id="cancel-create-resource">${cancelButtonLanbel}</button>`;

  const resourceNameElement = `<label for="resource-name">Resource name</label>
    <div class="input-wrapper">
      <input type="text" id="resource-name" autocomplete="off"></input>
      <span class="error" id="resource-name-error" role="alert"></span>
    </div>`;

  const resourceDefaultElement = `
    <label for="default-language">en (default)</label>
    <div class="input-wrapper">
      <textarea id="default-language">${currentText}</textarea>
      <span class="error" id="default-language-error" role="alert"></span>
    </div>`;

  const resourceRuElement = `
    <label for="ru-language">ru</label>
    <div class="input-wrapper">
      <textarea id="ru-language">${currentText}</textarea>
      <span class="error" id="ru-language-error" role="alert"></span>
    </div>`;

  const panelBodyContent = `<div class="field">${resourceNameElement}</div>
    <div class="field">${resourceDefaultElement}</div>
    <div class="field">${resourceRuElement}</div>
    <div class="actions">${saveButton}${cancelButton}</div>
    <footer class="content-footer">
      <small>Press <span class="hotkey-hint">Ctrl+Enter</span> to save, <span class="hotkey-hint">Esc</span> to cancel</small>
    </footer>`;

  return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource}; script-src 'nonce-${nonce}';">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <link rel="stylesheet" href="${cssUri.toString()}">
    </head>
    <body>
      <div class="container">
        <header>
          <h1>${title}</h1>
        </header>
        <div id="server-errors" class="server-errors" role="alert" aria-live="polite"></div>
        <section class="content">
          ${panelBodyContent}
        </section>
      </div>
    
      <script nonce="${nonce}" src="${jsUri.toString()}"></script>
    </body>
    </html>`;
}

/**
 * Сгенерировать случайную строку.
 * @returns Случайная строка для nonce.
 */
function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text = text + possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
