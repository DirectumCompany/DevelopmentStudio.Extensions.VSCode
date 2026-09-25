/* eslint-disable jsdoc/check-param-names */
/* eslint-disable jsdoc/multiline-blocks */
/* eslint-disable @typescript-eslint/array-type */
/* eslint-disable import/order */
import * as vscode from 'vscode';
import * as VSCodeApi from '../vscode-api';
import { SymbolSearcher } from './symbol-searcher-base';
import { NameAndDetail, SupportUriFromComment } from '../types';

/** Поисковик описания по информации из href-комментария */
export class SymbolSearcherByHrefComment extends SymbolSearcher {
  /** Определение из обертки. */
  private readonly wrapperDescription: SupportUriFromComment;

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
   * @param parent Родитель.
   * @param containerTypeNames Цепочка типов-контейнеров (без namespace).
   * @returns true - если контейнер подходит под условия, иначе - false.
   */
  protected async needGetSymbol(
    uri: vscode.Uri,
    container: vscode.DocumentSymbol,
    parent: NameAndDetail,
    containerTypeNames: string[],
  ): Promise<boolean> {
    const textLine = await this.getTextLine(uri, container.selectionRange.start);
    return this.wrapperDescription.isEqual({
      container: container,
      parent: parent,
      uri: uri,
      textLine: textLine,
      containerTypeNames: containerTypeNames,
    });
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
