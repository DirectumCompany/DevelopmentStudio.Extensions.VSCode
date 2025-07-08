import * as vscode from "vscode";
import * as VSCodeApi from './vscode-api';
import { DocumentSymbolLoader } from './symbol-loader';
import { SymbolSearcher } from './symbol-searcher';

/** Дополнительный поставщик определений. */
export class AdditionalDefinitionProvaider implements vscode.DefinitionProvider {
  /**
   *  Вернуть дополнительные определения.
   *  @param document Документ, в котором была вызвана команда.
   *  @param position Позиция, в которой была вызвана команда.
   */
  async getAdditionalDefinitions(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Definition | null> {
    let modifiedDefinitions = [];

    const currentDefinitions = await VSCodeApi.getDefinitions(document.uri, position);

    for (const definition of currentDefinitions) {
      const symbolLoader = new DocumentSymbolLoader(definition);

      if (await symbolLoader.tryLoadDocumentSymbols()) {
        const originalSymbols = await SymbolSearcher.getSymbols(
          symbolLoader.originalUri!,
          symbolLoader.documentSymbol!,
        );

        modifiedDefinitions.unshift(
          ...originalSymbols.map(
            (symbol) => new vscode.Location(symbolLoader.originalUri!, symbol.container.selectionRange),
          ),
        );
      }
    }
    return Promise.resolve(modifiedDefinitions);
  }

  /** Признак, что идет работа над поиском определния. */
  private lock: boolean = false;

  async provideDefinition(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Definition | null> {
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