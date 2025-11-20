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
   * Найти описания.
   * @param uri Uri документа, в котором ищем.
   * @param container Контейнер.
   * @returns Массив найденных описаний.
   */
  private async findSymbols(uri: vscode.Uri, container: vscode.DocumentSymbol): Promise<vscode.DocumentSymbol[]> {
    const foundSymbols: vscode.DocumentSymbol[] = [];

    if (await this.needGetSymbol(uri, container)) {
      foundSymbols.push(container);
    }

    if (!(this.needOnlyOneResult && foundSymbols.length > 0)) {
      for (const element of container.children) {
        foundSymbols.push(...(await this.findSymbols(uri, element)));
        if (this.needOnlyOneResult && foundSymbols.length > 0) {
          break;
        }
      }
    }
    return Promise.resolve(foundSymbols);
  }

  public async getSymbols(): Promise<ElementDetail | vscode.Location[]> {
    const result: ElementDetail[] = [];

    const uri = this.documentUri;
    const symbols = await VSCodeApi.getSymbols(uri);

    if (symbols && symbols.length > 0) {
      for (const symbol of symbols) {
        this.parent = symbol.name;

        const foundSymbols: vscode.DocumentSymbol[] = await this.findSymbols(uri, symbol);
        result.push(
          ...foundSymbols.map((element) => ({
            container: element,
            parent: this.parent!,
            uri: uri,
          })),
        );

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
