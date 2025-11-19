import * as vscode from 'vscode';
import * as VSCodeApi from '../vscode-api';
import { ElementDetail, IGetSymbols } from '../types';

/** Поисковик описания. */
export abstract class SymbolSearcher implements IGetSymbols {
  /** Имя предка. */
  protected parent?: string;

  /** Признак, что нужен только один результат. */
  protected needOnlyOneResult: boolean = false;

  /** Uri документа. */
  protected documentUri!: vscode.Uri;

  /**
   * Признак, что контейнер подходит под условия.
   * @param uri Uri документа, в котором ищем.
   * @param container Контейнер.
   * @returns true - если контейнер подходит под условия, иначе - false.
   */
  protected abstract needGetSymbol(uri: vscode.Uri, container: vscode.DocumentSymbol): Promise<boolean>;

  /**
   * Найти описание.
   * @param uri Uri документа, в котором ищем.
   * @param container Контейнер.
   * @param findResult Список найденных описаний.
   * @returns true - если описание найдено, иначе false.
   */
  private async findSymbol(
    uri: vscode.Uri,
    container: vscode.DocumentSymbol,
    findResult: vscode.DocumentSymbol[],
  ): Promise<boolean> {
    let tokenFound = false;
    let tokenFindedInChilds = false;

    if (await this.needGetSymbol(uri, container)) {
      findResult.push(container);
      tokenFound = true;
    }

    if (!(this.needOnlyOneResult && tokenFound)) {
      for (const element of container.children) {
        const iterateTokenFindedInChild = await this.findSymbol(uri, element, findResult);
        tokenFindedInChilds = iterateTokenFindedInChild || tokenFindedInChilds;
        if (this.needOnlyOneResult && iterateTokenFindedInChild) {
          break;
        }
      }
    }
    return Promise.resolve(tokenFound || tokenFindedInChilds);
  }

  public async getSymbols(): Promise<ElementDetail | vscode.Location[]> {
    const result: ElementDetail[] = [];

    const uri = this.documentUri;
    const symbols = await VSCodeApi.getSymbols(uri);

    if (symbols && symbols.length > 0) {
      for (const symbol of symbols) {
        this.parent = symbol.name;

        let findResult: vscode.DocumentSymbol[] = [];
        if (await this.findSymbol(uri, symbol, findResult)) {
          result.push(
            ...findResult.map((element) => ({
              container: element,
              parent: this.parent!,
              uri: uri,
            })),
          );
        }

        if (this.needOnlyOneResult && result.length) {
          break;
        }
      }
    }

    return Promise.resolve(
      this.needOnlyOneResult
        ? result.pop()!
        : result.map((symbol) => new vscode.Location(symbol.uri, symbol.container.selectionRange)),
    );
  }

  /**
   * Конструктор.
   * @param uri Uri документа.
   */
  constructor(uri: vscode.Uri) {
    this.documentUri = uri;
  }
}
