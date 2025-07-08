import * as vscode from "vscode";

/**
 * Вернуть определения.
 * @param documentUri Uri документа, в котором вызывана команда.
 * @param position Позиция, где была вызвана команда.
 */
export const getDefinitions = async (documentUri: vscode.Uri, position: vscode.Position) => {
  return vscode.commands.executeCommand<vscode.Location[]>('vscode.executeDefinitionProvider', documentUri, position);
};

/**
 * Вернуть описания.
 * @param documentUri Uri документа, в котором вызывана команда.
 */
export const getSymbols = async (documentUri: vscode.Uri) => {
  return vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', documentUri);
};

/** Загрузить массив строк из документа.
 * @param documentUri Uri документа, откуда надо загрузить строки.
 */
export const loadDocumentLine = async (uri: vscode.Uri) => {
  const dtsDocument = (await vscode.workspace.fs.readFile(uri)).toString();
  return dtsDocument.split('\n');
};