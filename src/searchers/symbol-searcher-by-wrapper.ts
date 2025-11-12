import * as vscode from 'vscode';
import * as VSCodeApi from '../vscode-api';
import { ProgrammingConstruct } from '../constructs/programming-construct';
import { SymbolSearcher } from './symbol-searcher-base';
import { TextLinesByUri } from '../types';

/** Поисковик описания по определению из обертки */
export class SymbolSearcherByWrapperDescription extends SymbolSearcher {
  /** Определение из обертки. */
  private wrapperDescription: ProgrammingConstruct;

  /** Словарь строк документа по Uri. */
  private textLinesByUriDictionary: TextLinesByUri;

  /** Вернуть строку по позиции.
   * @param uri Uri документа, в котором ищем.
   * @param position Позиция.
   * @returns Строка по переданной позиции.
   */
  private async getTextLine(uri: vscode.Uri, position: vscode.Position): Promise<string> {
    const textLines = await this.getTextLinesByUri(uri);
    return Promise.resolve(textLines[position.line]);
  }

  /**
   * Вернуть список строк по Uri.
   * @param uri Uri документа.
   * @returns Массив строк из документа по указанному Uri.
   */
  private async getTextLinesByUri(uri: vscode.Uri): Promise<string[]> {
    const index = uri.path;
    if (!this.textLinesByUriDictionary[index] || this.textLinesByUriDictionary[index].length === 0) {
      this.textLinesByUriDictionary[index] = await VSCodeApi.loadDocumentLines(uri);
    }
    return this.textLinesByUriDictionary[index];
  }

  /**
   * Признак, что контейнер подходит под условия при сравнении с определением из обертки.
   * @param uri Uri документа, в котором ищем.
   * @param container Контейнер.
   * @returns true - если контейнер подходит под условия, иначе - false.
   */
  protected async needGetSymbol(uri: vscode.Uri, container: vscode.DocumentSymbol): Promise<boolean> {
    const textLine = await this.getTextLine(uri, container.selectionRange.start);
    return Promise.resolve(
      this.wrapperDescription.IsEqual({
        container: container,
        parent: this.parent!,
        uri: uri,
        textLine: textLine,
      }),
    );
  }

  /**
   * Конструктор.
   * @param uri Uri документа.
   * @param wrapperDescription Описание программной конструкции.
   */
  constructor(uri: vscode.Uri, wrapperDescription: ProgrammingConstruct) {
    super();
    this.wrapperDescription = wrapperDescription;
    this.needOnlyOneResult = false;
    this.documentUri = wrapperDescription.getUris(uri);
    this.textLinesByUriDictionary = {};
  }
}
