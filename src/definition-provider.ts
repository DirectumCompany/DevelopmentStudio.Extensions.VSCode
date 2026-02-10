/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-inferrable-types */
/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/array-type */
import * as vscode from 'vscode';
import * as VSCodeApi from './vscode-api';
import { DocumentSymbolLoader } from './symbol-loader';

/** Дополнительный поставщик определений. */
export class AdditionalDefinitionProvider implements vscode.DefinitionProvider {
  /**
   *  Вернуть дополнительные определения.
   *  @param document Документ, в котором была вызвана команда.
   *  @param position Позиция, в которой была вызвана команда.
   *  @returns Определение символа, представляемого в виде одного или нескольких {@link vscode.Location местоположений}.
   */
  private async getAdditionalDefinitions(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Definition> {
    let modifiedDefinitions: vscode.Location[] = [];

    const currentDefinitions = await VSCodeApi.getDefinitions(document.uri, position);

    for (const definition of currentDefinitions) {
      const wrapperProgrammingConstruct = await DocumentSymbolLoader.loadWrapperProgrammingConstruct(definition);
      if (wrapperProgrammingConstruct) {
        const sourceLocation = new vscode.Location(document.uri, position);
        const originalSymbols = await wrapperProgrammingConstruct.getOriginalSymbols(sourceLocation);
        modifiedDefinitions.unshift(...originalSymbols);
      }
    }
    return Promise.resolve(modifiedDefinitions);
  }

  /** Признак, что идет работа над поиском определения. */
  private lock: boolean = false;

  /**
   * Предоставить определение символа в заданной позиции документа.
   * @param document Документ, в котором была вызвана команда.
   * @param position Позиция, в которой была вызвана команда.
   * @returns Определение символа, представляемого в виде одного или нескольких {@link vscode.Location местоположений}.
   */
  public async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Definition | null> {
    if (this.lock) {
      return Promise.resolve(null);
    }
    let modifiedDefinitions = null;
    try {
      this.lock = true;
      modifiedDefinitions = await this.getAdditionalDefinitions(document, position);
    } finally {
      this.lock = false;
    }
    return Promise.resolve(modifiedDefinitions);
  }
}

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
