/* eslint-disable @typescript-eslint/explicit-function-return-type */
import * as vscode from 'vscode';
import { getFullQualifiedName, getParsedFilePath } from './parsed-file-path';
import { runResourceDialog } from './run-resource-dialog';

const DOUBLE_QUOTE = '"';
const SLASH = '\\';

/**
 * Создать ресурс из выделенного в текстовом редакторе текста.
 * @param editor Редактор.
 * @param context Контекст.
 * @returns Создаем ресурс из выделенного в текстовом редакторе текста.
 */
export async function createResourceFromTextCommand(editor: vscode.TextEditor, context: vscode.ExtensionContext) {
  const document = editor.document;

  const parsedFilePath = getParsedFilePath(document.uri.fsPath);
  if (!parsedFilePath) {
    vscode.window.showWarningMessage('Unexpected project folder structure.');
    return;
  }

  const startPosition = editor.selection.start;
  const currentLine = document.lineAt(startPosition.line).text;

  const stringPosition = getPositions(currentLine, startPosition);
  if (!stringPosition) {
    vscode.window.showWarningMessage('Place cursor on a string literal like "text" to extract it.');
    return;
  }

  /**
   * Задать выделенный фрагмент в редакторе.
   * @param selection Выделенный фрагмент, который нужно установить.
   * @param needActivateEditor Показывать документ в редакторе после установки выделенного фрагмента.
   */
  const setSelection = async (selection: vscode.Selection, needActivateEditor = true) => {
    editor.selection = selection;
    if (needActivateEditor) await vscode.window.showTextDocument(editor.document, editor.viewColumn);
  };

  /** Восстановить выделение в редакторе. */
  const restoreSelection = async () => {
    await setSelection(previousSelection);
  };

  /**
   * Установить фокус после ключа ресурса.
   * @param value Ключ ресурса, длина которого определяет позицию курсора.
   */
  const setFocusAfterResourceKey = async (value: string) => {
    const character = stringPosition.start + value.length;
    const newSelection = new vscode.Selection(
      new vscode.Position(startPosition.line, character),
      new vscode.Position(startPosition.line, character),
    );
    await setSelection(newSelection);
  };

  /**
   * Обновить выделенный фрагмент в редакторе и вернуть старое значение выделения.
   * @param selection Новое выделение.
   * @returns Предыдущее выделение.
   */
  const updateSelection = async (selection: vscode.Selection): Promise<vscode.Selection> => {
    const previosValue = editor.selection;

    await setSelection(selection, false);

    return previosValue;
  };

  const stringValueSelection = new vscode.Selection(
    new vscode.Position(startPosition.line, stringPosition.start),
    new vscode.Position(startPosition.line, startPosition.character + stringPosition.end + 1),
  );

  let needRestoreSelection = true;
  const previousSelection = await updateSelection(stringValueSelection);
  try {
    const stringValue = currentLine.slice(stringPosition.start + 1, startPosition.character + stringPosition.end);

    await runResourceDialog(
      context,
      stringValue,
      parsedFilePath,
      async (key: string): Promise<void> => {
        const resourceFullKey = getFullQualifiedName(parsedFilePath, key);

        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.replace(document.uri, stringValueSelection, resourceFullKey);
        await vscode.workspace.applyEdit(workspaceEdit);

        needRestoreSelection = false;

        await setFocusAfterResourceKey(resourceFullKey);
      },
      async () => {
        if (needRestoreSelection) await restoreSelection();
      },
    );
  } catch (err: unknown) {
    if (needRestoreSelection) await restoreSelection();
    vscode.window.showErrorMessage(`${err as string}`);
  }
}

/**
 * Получить позицию начала и конца строки.
 * @param line Строка из редактора.
 * @param position Позиция.
 * @returns Начало и конец строки или null, если границы строки определить не удалось.
 */
function getPositions(
  line: string,
  position: vscode.Position,
): {
  /** Индекс начала строкового литерала в строке. */
  start: number;
  /** Индекс конца строкового литерала в строке. */
  end: number;
} | null {
  const lineBefore = line.slice(0, position.character);
  const lineAfter = line.slice(position.character);

  /**
   * Найти индекс неэкранированного символа кавычек.
   * @param sourceLine Строка, в которой ищем кавычку.
   * @param searchFunction Функция поиска символа, начиная с позиции.
   * @param getNextIndex Функция перехода к следующей позиции поиска.
   * @returns Индекс неэкранированной кавычки или -1.
   */
  const findUnescapedQuoteIndex = (
    sourceLine: string,
    searchFunction: (searchCharacter: string, position?: number) => number,
    getNextIndex: (previous: number) => number,
  ): number => {
    let result: number;
    let nextIndex;
    do {
      result = searchFunction(DOUBLE_QUOTE, nextIndex);
      nextIndex = getNextIndex(result);
    } while (result !== -1 && sourceLine[result - 1] === SLASH);
    return result;
  };

  const startQuote = findUnescapedQuoteIndex(
    lineBefore,
    (value, index) => lineBefore.lastIndexOf(value, index),
    (previous) => previous - 1,
  );

  const endQuote = findUnescapedQuoteIndex(
    lineAfter,
    (value, index) => lineAfter.indexOf(value, index),
    (previous) => previous + 1,
  );

  if (startQuote === -1 || endQuote === -1) return null;
  return { start: startQuote, end: endQuote };
}