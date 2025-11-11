import * as vscode from 'vscode';
import * as VSCodeApi from '../vscode-api';
import { ProgrammingConstruct } from '../constructs/programming-construct';
import { ElementDetail } from '../types';

/** Поисковик описания. */
export abstract class SymbolSearcher {
  /** Имя предка. */
  protected parent?: string;

  /** Признак, что нужен только один результат. */
  protected needOnlyOneResult: boolean = false;

  /** Uri документа. */
  protected documentUri?: vscode.Uri[];

  /**
   * Признак, что контейнер подходит под условия.
   * @param uri Uri документа, в котором ищем.
   * @param container Контейнер.
   * @returns true - если контейнер подходит под условия, иначе - false.
   */
  protected abstract needGetSymbol(uri: vscode.Uri, container: vscode.DocumentSymbol): Promise<boolean>;

  /**
   * Найти описание.
   * @param uri Uri документа, в котором ищем.
   * @param container Контейнер.
   * @param findResult Список найденных описаний.
   * @returns true - если описание найдено, иначе false.
   */
  private async findSymbol(
    uri: vscode.Uri,
    container: vscode.DocumentSymbol,
    findResult: vscode.DocumentSymbol[],
  ): Promise<boolean> {
    let tokenFinded = false;
    let tokenFindedInChilds = false;

    if (await this.needGetSymbol(uri, container)) {
      findResult.push(container);
      tokenFinded = true;
    }

    if (!(this.needOnlyOneResult && tokenFinded)) {
      for (const element of container.children) {
        const iterateTokenFindedInChild = await this.findSymbol(uri, element, findResult);
        tokenFindedInChilds = iterateTokenFindedInChild || tokenFindedInChilds;
        if (this.needOnlyOneResult && iterateTokenFindedInChild) {
          break;
        }
      }
    }
    return Promise.resolve(tokenFinded || tokenFindedInChilds);
  }

  /**
   * Вернуть описания.
   * @returns Массив с детальными описаниями.
   */
  public async localGetSymbols(): Promise<ElementDetail[]> {
    const result: ElementDetail[] = [];

    for (const uri of this.documentUri!) {
      const symbols = await VSCodeApi.getSymbols(uri);

      if (symbols.length > 0) {
        for (const symbol of symbols) {
          this.parent = symbol.name;

          let findResult: vscode.DocumentSymbol[] = [];
          if (await this.findSymbol(uri, symbol, findResult)) {
            result.push(
              ...findResult.map((element) => ({
                container: element,
                parent: this.parent!,
                uri: uri,
              })),
            );
          }

          if (this.needOnlyOneResult && result.length) {
            break;
          }
        }
      }
    }
    return Promise.resolve(result);
  }

  /**
   * Вернуть описания по токену.
   * @param documentUri Uri документа, в котором ищем описание.
   * @param tokens Токены поиска.
   * @param range Диапазон поиска.
   * @returns Массив с детальными описаниями.
   */
  public static async getSymbolsByToken(
    documentUri: vscode.Uri,
    tokens: string,
    range: vscode.Range,
  ): Promise<ElementDetail[]> {
    const local = new SymbolSearcherByTokenAndRange(documentUri, tokens, range!);
    return await local.localGetSymbols();
  }

  /**
   * Вернуть описания по ссылке из комментария.
   * @param wrapperDescription Определение из обертки, на основе которого ищем описание.
   * @returns Массив с детальными описаниями.
   */
  public static async getOriginalSymbolByHrefComment(
    wrapperDescription: ProgrammingConstruct,
  ): Promise<ElementDetail[]> {
    const result: ElementDetail[] = [];
    if (wrapperDescription.uriFromComment) {
      const local = new SymbolSearcherByWrapperDescription(wrapperDescription.uriFromComment, wrapperDescription);
      return Promise.resolve(await local.localGetSymbols());
    }
    return Promise.resolve(result);
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
    super();
    this.documentUri = [uri];
    this.token = token;
    this.range = range;
    this.needOnlyOneResult = true;
  }
}

/** Поисковик описания по определению из обертки */
class SymbolSearcherByWrapperDescription extends SymbolSearcher {
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
