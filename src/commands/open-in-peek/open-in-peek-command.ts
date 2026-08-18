/* eslint-disable @typescript-eslint/explicit-function-return-type */
import * as vscode from 'vscode';
import * as VSCodeApi from '../../vscode-api';

/**
 * Показ списка с оригинальными символами.
 * @param document Документ, в котором была вызвана команда.
 * @param position Позиция, в которой была вызвана команда.
 * @returns Показывается список с оригинальными символами.
 */
export async function opensInPeekCommand(document: vscode.TextDocument, position: vscode.Position) {
  const modifiedDefinitions = await VSCodeApi.getDefinitions(document.uri, position);
  const onlyResourcesOrQueriesDefinition = modifiedDefinitions.filter(
    (item) =>
      item.uri.fsPath.endsWith('.resx') || item.uri.fsPath.endsWith('.sql') || item.uri.fsPath.endsWith('.g.xml'),
  );
  if (onlyResourcesOrQueriesDefinition.length > 0) {
    await VSCodeApi.showReferences(document.uri, position, onlyResourcesOrQueriesDefinition);
  }
}
