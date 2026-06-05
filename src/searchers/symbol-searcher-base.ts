/* eslint-disable @typescript-eslint/array-type */
/* eslint-disable @typescript-eslint/no-inferrable-types */
import * as vscode from 'vscode';
import * as VSCodeApi from '../vscode-api';
import { ElementDetail, IGetSymbols, NameAndDetail } from '../types';

/** Поисковик описания. */
export abstract class SymbolSearcher implements IGetSymbols {
  /** Признак, что нужен только один результат. */
  protected needOnlyOneResult: boolean = false;

  /** Uri документа. */
  protected documentUri!: vscode.Uri;

  /**
   * Признак, что контейнер подходит под условия.
   * @param uri Uri документа, в котором ищем.
   * @param container Контейнер.
   * @param parent Родитель.
   * @returns true - если контейнер подходит под условия, иначе - false.
   */
  protected abstract needGetSymbol(
    uri: vscode.Uri,
    container: vscode.DocumentSymbol,
    parent: NameAndDetail,
  ): Promise<boolean>;

  /**
   * Найти описания.
   * @param uri Uri документа, в котором ищем.
   * @param container Контейнер.
   * @param parent Родитель.
   * @param namespace Пространство имен.
   * @returns Массив найденных описаний.
   */
  private async findSymbols(
    uri: vscode.Uri,
    container: vscode.DocumentSymbol,
    parent: NameAndDetail,
    namespace: string,
  ): Promise<ElementDetail[]> {
    const foundSymbols: ElementDetail[] = [];

    if (await this.needGetSymbol(uri, container, parent)) {
      foundSymbols.push({
        container: container,
        parent: parent,
        namespace: namespace,
        uri: uri,
      });
    }
    if (this.needOnlyOneResult && foundSymbols.length > 0) return foundSymbols;

    const parentContainer = { name: container.name, detail: container.detail };
    for (const element of container.children) {
      foundSymbols.push(...(await this.findSymbols(uri, element, parentContainer, namespace)));
      if (this.needOnlyOneResult && foundSymbols.length > 0) return foundSymbols;
    }
    return foundSymbols;
  }

  public async getSymbols(): Promise<ElementDetail | vscode.Location[]> {
    let foundSymbols: ElementDetail[] = [];
    const uri = this.documentUri;
    const symbols = await VSCodeApi.getSymbols(uri);

    if (symbols && symbols.length > 0) {
      for (const symbol of symbols) {
        const parent = { name: '', detail: '' };
        foundSymbols = await this.findSymbols(uri, symbol, parent, symbol.name);
        if (this.needOnlyOneResult && foundSymbols.length) {
          break;
        }
      }
    }

    return this.needOnlyOneResult
      ? foundSymbols.pop()!
      : foundSymbols.map((symbol) => new vscode.Location(symbol.uri, symbol.container.selectionRange));
  }

  /**
   * Конструктор.
   * @param uri Uri документа.
   */
  constructor(uri: vscode.Uri) {
    this.documentUri = uri;
  }
}
