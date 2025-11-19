import * as vscode from 'vscode';
import * as VSCodeApi from '../vscode-api';
import { SymbolSearcher } from './symbol-searcher-base';
import { SupportUriFromComment } from '../types';

/** Поисковик описания по информации из href-комментария */
export class SymbolSearcherByHrefComment extends SymbolSearcher {
  /** Определение из обертки. */
  private wrapperDescription: SupportUriFromComment;

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
    return Promise.resolve(position.line < this.textLines.length - 1 ? this.textLines[position.line] : '');
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
      this.wrapperDescription.isEqual({
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
  constructor(wrapperDescription: SupportUriFromComment) {
    super(wrapperDescription.uriFromComment);
    this.wrapperDescription = wrapperDescription;
    this.needOnlyOneResult = false;
  }
}
