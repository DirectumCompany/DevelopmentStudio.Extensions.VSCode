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
   * Вернуть ссылку на документ и признак инъекции из комментария.
   * @returns Возвращает Uri на файл с описанием определения и признак инъекции или null.
   */
  private async getInfoFromComment(): Promise<{ uri: vscode.Uri; isInjection: boolean } | null> {
    const regexHref = /\/\/\/\s*<see href="([^"]*)" internal=""( proxy="")? \/>/;
    for (let lineNumber = this.range.start.line - 1; lineNumber > 0; lineNumber--) {
      const line = this.documentLines[lineNumber];
      const match = line.match(regexHref);
      if (match) {
        return Promise.resolve({ uri: vscode.Uri.parse(match[1].toString()), isInjection: match[2]?.length > 0 });
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
   * @param isInjection Признак, что определение - инъекция.
   * @returns Определение из обертки, которое нашли в заданном файле по заданному диапазону.
   */
  private async getWrapperDocumentSymbol(isInjection: boolean): Promise<ProgrammingConstruct | null> {
    const token = this.getToken();
    const symbolWrapper = await SymbolSearcher.getSymbols(this.uri, token, this.range);
    const firstElementDetail = symbolWrapper.shift();
    if (firstElementDetail) {
      firstElementDetail.isInjection = isInjection;
      return Promise.resolve(ProgrammingConstruct.Create(firstElementDetail));
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
      const infoFromComment = await this.getInfoFromComment();
      if (infoFromComment) {
        this.originalUri = infoFromComment.uri;
        this.documentSymbol = await this.getWrapperDocumentSymbol(infoFromComment.isInjection);
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
