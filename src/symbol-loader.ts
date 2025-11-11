import * as vscode from 'vscode';
import * as VSCodeApi from './vscode-api';
import { SymbolSearcher } from './searchers/symbol-searcher';
import { ProgrammingConstruct } from './constructs/programming-construct';
import { InfoFromComment } from './types';

/** Загрузчик описания из враппера. */
export class DocumentSymbolLoader {
  /** Исходный диапазон документа, в котором была вызвана команда. */
  private range: vscode.Range;

  /** Исходный URI документа, в котором была вызвана команда. */
  private uri: vscode.Uri;

  /** Массив строк документа. */
  private documentLines: string[];

  /** Описание из враппера. */
  public documentSymbol?: ProgrammingConstruct | null;

  /**
   * Вернуть ссылку на документ и признак инъекции из комментария.
   * @returns Возвращает Uri на файл с описанием определения или null и признак инъекции.
   */
  private async getInfoFromComment(): Promise<InfoFromComment> {
    const regexHref = /\/\/\/\s*<see href="file:\/\/\/([^"]*)" internal=""( proxy="")? \/>/;
    for (let lineNumber = this.range.start.line - 1; lineNumber > 0; lineNumber--) {
      const line = this.documentLines[lineNumber];
      const match = line.match(regexHref);
      if (match) {
        return Promise.resolve({ uri: vscode.Uri.file(match[1].toString()), isInjection: match[2]?.length > 0 });
      }
    }
    return Promise.resolve({ uri: null, isInjection: false });
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
   * @param infoFromComment  {@link InfoFromComment Uri и признак инъекции}, полученные из комментария.
   * @returns Определение из обертки, которое нашли в заданном файле по заданному диапазону или null.
   */
  private async getWrapperDocumentSymbol(infoFromComment: InfoFromComment): Promise<ProgrammingConstruct | null> {
    const token = this.getToken();
    const symbolWrapper = await SymbolSearcher.getSymbols(this.uri, token, this.range);
    const firstElementDetail = symbolWrapper.shift();
    if (firstElementDetail) {
      return Promise.resolve(ProgrammingConstruct.Create(infoFromComment, firstElementDetail));
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
        this.documentSymbol = await this.getWrapperDocumentSymbol(infoFromComment);
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
