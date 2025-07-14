import * as vscode from 'vscode';
import * as VSCodeApi from './vscode-api';
import { SymbolSearcher } from './symbol-searcher';
import { ProgrammingConstruct } from './programming-construct';

/** Загрузчик описания из враппера. */
export class DocumentSymbolLoader {
  /** Исходный диапазон документа, в котором была вызвана команда. */
  private range: vscode.Range;

  /** Исходный URI документа, в котором была вызвана команда. */
  private uri: vscode.Uri;

  /** Массив строк документа. */
  private documentLines: string[];

  /** Uri из href-комментария. */
  public originalUri?: vscode.Uri | null;

  /** Описание из враппера. */
  public documentSymbol?: ProgrammingConstruct | null;

  /**
   * Вернуть ссылку на документ из href-комментария.
   * @returns Возвращает Uri на файл с описанием определения или null.
   */
  private async getUriFromHrefComment(): Promise<vscode.Uri | null> {
    const regexHref = /\/\/\/\s*<see href="([^"]*)"\s*\/>/;
    for (let lineNumber = this.range.start.line - 1; lineNumber > 0; lineNumber--) {
      const line = this.documentLines[lineNumber];
      const match = line.match(regexHref);
      if (match) {
        return Promise.resolve(vscode.Uri.parse(match[1].toString()));
      }
    }
    return Promise.resolve(null);
  }

  /**
   * Вернуть токен.
   * @returns Токен из массива строк по заданному диапазону.
   */
  private getToken(): string {
    return this.documentLines[this.range.start.line].substring(this.range.start.character, this.range.end.character);
  }

  /**
   * Вернуть определение из обертки.
   * @returns Определение из обертки, которое нашли в заданном файле по заданному диапазону.
   */
  private async getWrapperDocumentSymbol(): Promise<ProgrammingConstruct | null> {
    const token = this.getToken();
    const symbolWrapper = await SymbolSearcher.getSymbols(this.uri, token, this.range);
    if (symbolWrapper.length > 0) {
      return Promise.resolve(ProgrammingConstruct.Create(symbolWrapper[0]));
    }
    return Promise.resolve(null);
  }

  /**
   * Попытаться загрузить определение.
   * @returns true - если загрузить определение удалось, иначе false.
   */
  public async tryLoadDocumentSymbols(): Promise<boolean> {
    if (this.needLoadDocumentSymbol()) {
      this.documentLines = await VSCodeApi.loadDocumentLine(this.uri);
      this.originalUri = await this.getUriFromHrefComment();
      if (this.originalUri) {
        this.documentSymbol = await this.getWrapperDocumentSymbol();
        if (this.documentSymbol) {
          return Promise.resolve(true);
        }
      }
    }
    return Promise.resolve(false);
  }

  /**
   * Проверить, нужно ли загружать конструкцию.
   * @returns true - если нужно загржуать, иначе false.
   */
  private needLoadDocumentSymbol(): boolean {
    return this.uri.fsPath.endsWith('g.cs');
  }

  /**
   * Конструктор.
   * @param definition Определение.
   */
  constructor(definition: vscode.Location) {
    this.range = definition.range;
    this.uri = definition.uri;
    this.documentLines = [];
  }
}
