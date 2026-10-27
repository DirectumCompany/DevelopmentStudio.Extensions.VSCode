/* eslint-disable jsdoc/require-returns */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/array-type */
import * as vscode from 'vscode';

/**
 * Вернуть определения.
 * @param documentUri Uri документа, в котором вызывана команда.
 * @param position Позиция, где была вызвана команда.
 */
export const getDefinitions = async (documentUri: vscode.Uri, position: vscode.Position) => {
  return vscode.commands.executeCommand<vscode.Location[]>('vscode.executeDefinitionProvider', documentUri, position);
};

/**
 * Вернуть ссылки на символ в позиции.
 * @param documentUri Uri документа, в котором вызывана команда.
 * @param position Позиция, где была вызвана команда.
 */
export const getReferencesAt = async (documentUri: vscode.Uri, position: vscode.Position) => {
  return vscode.commands.executeCommand<vscode.Location[]>('vscode.executeReferenceProvider', documentUri, position);
};

/**
 * Найти символы по имени во всем workspace.
 * @param query Имя символа.
 */
export const findWorkspaceSymbols = async (query: string) => {
  return vscode.commands.executeCommand<vscode.SymbolInformation[]>('vscode.executeWorkspaceSymbolProvider', query);
};

/**
 * Вернуть описания.
 * @param documentUri Uri документа, в котором вызывана команда.
 */
export const getSymbols = async (documentUri: vscode.Uri) => {
  return vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', documentUri);
};

/**
 * Вернуть реализацию.
 * @param documentUri Uri документа, в котором вызывана команда.
 * @param position Позиция, где была вызвана команда.
 */
export const getImplementations = async (documentUri: vscode.Uri, position: vscode.Position) => {
  return vscode.commands.executeCommand<vscode.Location[]>(
    'vscode.executeImplementationProvider',
    documentUri,
    position,
  );
};

/**
 * Вернуть определения типа.
 * @param documentUri Uri документа, в котором вызывана команда.
 * @param position Позиция, где была вызвана команда.
 */
export const getTypeDefinitions = async (documentUri: vscode.Uri, position: vscode.Position) => {
  return vscode.commands.executeCommand<vscode.Location[]>(
    'vscode.executeTypeDefinitionProvider',
    documentUri,
    position,
  );
};

/**
 * Показать ссылки.
 * @param documentUri Uri документа, где была вызвана команда.
 * @param position Позиция, где была вызвана команад.
 * @param originalSymbols Определения, которые нужно показать.
 */
export const showReferences = async (
  documentUri: vscode.Uri,
  position: vscode.Position,
  originalSymbols: vscode.Location[],
) => {
  return vscode.commands.executeCommand('editor.action.showReferences', documentUri, position, originalSymbols);
};
