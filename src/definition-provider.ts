import * as vscode from "vscode";
import * as VSCodeApi from './vscode-api';
import { DocumentSymbolLoader } from './symbol-loader';
import { SymbolSearcher } from './symbol-searcher';

/** Дополнительный поставщик определений. */
export class AdditionalDefinitionProvider implements vscode.DefinitionProvider {
  /**
   *  Вернуть дополнительные определения.
   *  @param document Документ, в котором была вызвана команда.
   *  @param position Позиция, в которой была вызвана команда.
   *  @param [fromCommand=false] Признак, что вызов был сделан из команды.
   *  @returns Определение символа, представляемого в виде одного или нескольких {@link vscode.Location местоположений}.
   */
  private async getAdditionalDefinitions(
    document: vscode.TextDocument,
    position: vscode.Position,
    fromCommand: boolean = false,
  ): Promise<vscode.Definition> {
    let modifiedDefinitions: vscode.Location[] = [];

    const currentDefinitions = await VSCodeApi.getDefinitions(document.uri, position);

    for (const definition of currentDefinitions) {
      const symbolLoader = new DocumentSymbolLoader(definition);

      if (await symbolLoader.tryLoadDocumentSymbols()) {
        const originalSymbols = await SymbolSearcher.getSymbols(
          symbolLoader.originalUri!,
          symbolLoader.documentSymbol!,
        );

        if (originalSymbols.length > 0) {
          const needOpenDefinition = !fromCommand && originalSymbols.length === 1;
          if (needOpenDefinition) {
            await VSCodeApi.gotoDefinition(symbolLoader.originalUri!, originalSymbols[0].container.selectionRange);
          } else {
            modifiedDefinitions.push(
              ...originalSymbols.map(
                (symbol) => new vscode.Location(symbolLoader.originalUri!, symbol.container.selectionRange),
              ),
            );
          }
        } else {
          modifiedDefinitions.push(definition);
        }
      } else {
        modifiedDefinitions.push(definition);
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

  /**
   * Выполнить команду перехода к определению символа в заданной позиции документа или показа списка с такими символами.
   * @param document Документ, в котором была вызвана команда.
   * @param position Позиция, в которой была вызвана команда.
   * @returns Производится переход к определению символа, если нашлось только одно определение или показывается peek, если нашлось несколько.
   */
  public async provideDefinitionCommand(document: vscode.TextDocument, position: vscode.Position) {
    const modifiedDefinitions = (await this.getAdditionalDefinitions(document, position, true)) as vscode.Location[];
    if (modifiedDefinitions.length > 0) {
      if (modifiedDefinitions.length > 1) {
        await VSCodeApi.showReferences(document.uri, position, modifiedDefinitions);
      } else {
        const originalSymbol = modifiedDefinitions[0];
        await VSCodeApi.gotoDefinition(originalSymbol.uri, originalSymbol.range);
      }
    }
  }
}