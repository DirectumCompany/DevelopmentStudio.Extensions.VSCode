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
  public documentSymbol?: ProgrammingConstruct;

  /**
   * Вернуть ссылку на документ из href-комментария.
   * @returns Возвращает Uri на файл с описанием определения или null.
   */
  // TODO: не указан возвращаемый тип.
  private async getUriFromHrefComment(): Promise<vscode.Uri | null> {
    // TODO: регэксп потенциально опасен. Он не останавливается после нахождения
    // первого вхождения, а идёт дальше, захватывая в группу лишние символы.
    // Чтобы его ограничить, в шаблоне внутри группы нужно перечислить те же
    // кавычки, что и в ограничивающих условиях:
    //     /\/\/\/\s*<see href=['"`]([^'"`]*)['"`]\s*\/>/
    //                                  ^--- доп. кавычки
    // или заменить «жадный» квантификатор * на «ленивый» *? :
    //     /\/\/\/\s*<see href=['"`]([^']*?)['"`]\s*\/>/
    //                                   ^--- ленивый квантификатор
    const regexHref = /\/\/\/\s*<see href=['"`]([^']*)['"`]\s*\/>/;
    let match; // TODO: это точно нужно?
    for (let lineNumber = this.range.start.line - 1; lineNumber > 0; lineNumber--) {
      const line = this.documentLines[lineNumber];
      match = line.match(regexHref);
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
  // TODO: не указан возвращаемый тип.
  private getToken() {
    return this.documentLines[this.range.start.line].substring(this.range.start.character, this.range.end.character);
  }

  /**
   * Вернуть определение из обертки.
   * @returns Определение из обертки, которое нашли в заданном файле по заданному диапазону.
   */
  // TODO: не указан возвращаемый тип.
  private async getWrapperDocumentSymbol() {
    const token = this.getToken();
    const symbolWrapper = await SymbolSearcher.getSymbols(this.uri, token, this.range);
    // TODO: а мы уверены, что в SymbolWrapper есть хотя бы один элемент?
    return Promise.resolve(ProgrammingConstruct.Create(symbolWrapper[0]));
  }

  /** Попытаться загрузить определение. */
  // TODO: в документирующем комментарии не указано, что возвращает метод.
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

  /** Проверить, нужно ли загружать конструкцию. */
  // TODO: в документирующем комментарии не указано, что возвращает метод.
  // TODO: не указан возвращаемый тип.
  private needLoadDocumentSymbol() {
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
