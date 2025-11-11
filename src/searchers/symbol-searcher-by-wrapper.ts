import * as vscode from 'vscode';
import * as VSCodeApi from '../vscode-api';
import { ProgrammingConstruct } from '../constructs/programming-construct';
import { SymbolSearcher } from './symbol-searcher-base';

/** Поисковик описания по определению из обертки */
export class SymbolSearcherByWrapperDescription extends SymbolSearcher {
  /** Определение из обертки. */
  private wrapperDescription: ProgrammingConstruct;

  /** Строки документа. */
  private textLines: string[] = [];

  /** Вернуть строку по позиции.
   * @param uri Uri документа, в котором ищем.
   * @param position Позиция.
   * @returns Строка по переданной позиции.
   */
  private async getTextLine(uri: vscode.Uri, position: vscode.Position): Promise<string> {
    if (this.textLines.length === 0) {
      this.textLines = await VSCodeApi.loadDocumentLines(uri);
    }
    return Promise.resolve(this.textLines[position.line]);
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
  }
}
