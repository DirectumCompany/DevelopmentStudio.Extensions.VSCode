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
        wrapperProgrammingConstruct.sourceLocation = { document, position };
        const originalSymbols = await wrapperProgrammingConstruct.getOriginalSymbols();
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
    try {
      this.lock = true;
      const modifiedDefinitions = await this.getAdditionalDefinitions(document, position);
      return Promise.resolve(modifiedDefinitions);
    } finally {
      this.lock = false;
    }
  }
}
