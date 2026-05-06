/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/prefer-regexp-exec */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/array-type */
import * as vscode from 'vscode';
import * as VSCodeApi from './vscode-api';
import { SymbolSearcher } from './searchers/symbol-searcher-base';
import { InfoFromComment, IGetOriginalSymbols, ElementDetail, createWrapperConstruct } from './types';

/** Загрузчик описания из враппера. */
export class DocumentSymbolLoader {
  /** Исходный диапазон документа, в котором была вызвана команда. */
  private range: vscode.Range;

  /** Исходный URI документа, в котором была вызвана команда. */
  private uri: vscode.Uri;

  /** Массив строк документа. */
  private documentLines: string[];

  /**
   * Вернуть ссылку на документ и признак инъекции из комментария.
   * @param documentLines Массив строк документа.
   * @param range Диапазон документ, в котором была вызвана команда.
   * @returns Возвращает Uri на файл с описанием определения или null и признак инъекции.
   */
  public static async getInfoFromComment(documentLines: string[], range: vscode.Range): Promise<InfoFromComment> {
    const regexHref = /\/\/\/\s*<see href="file:\/\/\/([^"]*)" internal=""( proxy="")? \/>/;
    for (let lineNumber = range.start.line - 1; lineNumber > range.start.line - 10; lineNumber--) {
      const line = documentLines[lineNumber];
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
  private async getWrapperDocumentSymbol(infoFromComment: InfoFromComment): Promise<IGetOriginalSymbols | null> {
    const firstElementDetail = await this.getSymbolsByToken(this.uri, this.getToken(), this.range);
    if (firstElementDetail) {
      return Promise.resolve(createWrapperConstruct(infoFromComment, firstElementDetail));
    }
    return Promise.resolve(null);
  }

  /**
   * Вернуть описания по токену.
   * @param documentUri Uri документа, в котором ищем описание.
   * @param tokens Токены поиска.
   * @param range Диапазон поиска.
   * @returns Детальное описание или null, если нашлось больше одного описания.
   */
  private async getSymbolsByToken(
    documentUri: vscode.Uri,
    tokens: string,
    range: vscode.Range,
  ): Promise<ElementDetail | null> {
    const local = new SymbolSearcherByTokenAndRange(documentUri, tokens, range!);
    const symbol = await local.getSymbols();
    return Promise.resolve(!Array.isArray(symbol) ? symbol : null);
  }

  /**
   * Загрузить описание.
   * @returns Загруженное описание или null.
   */
  protected async loadDocumentSymbols(): Promise<IGetOriginalSymbols | null> {
    const infoFromComment = await DocumentSymbolLoader.getInfoFromComment(this.documentLines, this.range);
    const documentSymbol = await this.getWrapperDocumentSymbol(infoFromComment);
    return Promise.resolve(documentSymbol);
  }

  /** Загрузить массив строк из документа. */
  private async loadDocumentLines() {
    this.documentLines = await VSCodeApi.loadDocumentLines(this.uri);
  }

  /**
   * Конструктор.
   * @param definition Определение.
   */
  private constructor(definition: vscode.Location) {
    this.range = definition.range;
    this.uri = definition.uri;
    this.documentLines = [];
  }

  /**
   * Проверить, нужно ли загружать конструкцию.
   * @param uri Uri, который надо проверить.
   * @returns true - если нужно загружать, иначе false.
   */
  private static needLoadDocumentSymbol(uri: vscode.Uri): boolean {
    return uri.fsPath.endsWith('g.cs');
  }

  /**
   * Попытаться создать и инициализировать загрузчик описания из враппера.
   * @param definition Определение.
   * @returns Возвращает загрузчик описания из враппера или null.
   */
  private static async tryCreate(definition: vscode.Location): Promise<DocumentSymbolLoader | null> {
    if (DocumentSymbolLoader.needLoadDocumentSymbol(definition.uri)) {
      const documentSymbolLoader = new DocumentSymbolLoader(definition);
      await documentSymbolLoader.loadDocumentLines();
      return Promise.resolve(documentSymbolLoader);
    }
    return Promise.resolve(null);
  }

  /**
   * Загрузить описание.
   * @param location {@link vscode.Location Местоположение}, для которого нужно загрузить описание.
   * @returns Возвращает загрженное описание или null.
   */
  public static async loadWrapperProgrammingConstruct(location: vscode.Location): Promise<IGetOriginalSymbols | null> {
    const documentSymbolLoader = await DocumentSymbolLoader.tryCreate(location);
    if (documentSymbolLoader) {
      return Promise.resolve(await documentSymbolLoader.loadDocumentSymbols());
    }
    return Promise.resolve(null);
  }
}

/** Поисковик описания по токену и диапазону */
class SymbolSearcherByTokenAndRange extends SymbolSearcher {
  /** Токен для поиска. */
  private token: string;

  /** Диапазон поиска. */
  private range: vscode.Range;

  /**
   * Признак, что контейнер подходит под условия при сравнении с переданными токенами.
   * @param uri Uri документа, в котором ищем.
   * @param container Контейнер.
   * @returns true - если контейнер подходит под условия, иначе - false.
   */
  protected async needGetSymbol(uri: vscode.Uri, container: vscode.DocumentSymbol): Promise<boolean> {
    if (this.token === container.name) {
      const location = container.selectionRange;
      return Promise.resolve(location.isEqual(this.range));
    }
    return Promise.resolve(false);
  }

  /**
   * Конструктор.
   * @param uri Uri документа, в котором ищем.
   * @param token Токен для поиска.
   * @param range Диапазон для поиска.
   */
  constructor(uri: vscode.Uri, token: string, range: vscode.Range) {
    super(uri);
    this.token = token;
    this.range = range;
    this.needOnlyOneResult = true;
  }
}
