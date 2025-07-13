import * as vscode from "vscode";
import * as VSCodeApi from "./vscode-api";
import { ProgrammingConstruct } from './programming-construct';

/** Детальное описание элемента. */
export interface IElementDetail {
  container: vscode.DocumentSymbol;
  parent: string;
  textLine?: string;
}

/** Поисковик описания. */
export abstract class SymbolSearcher {
  /** Имя предка. */
  protected parent?: string;

  /** Признак, что нужен только один результат. */
  protected needOnlyOneResult: boolean = false;

  /** Uri документа. */
  protected documentUri?: vscode.Uri;

  /**
   * Признак, что контейнер подходит под условия.
   * @param container Контейнер.
   * @returns true - если контейнер подходит под условия, иначе - false.
   */
  protected abstract needGetSymbol(container: vscode.DocumentSymbol): Promise<boolean>;

  /**
   * Найти описание.
   * @param container Контейнер.
   * @param findResult Список найденных описаний.
   * @returns true - если описание найдено, иначе false.
   */
  private async findSymbol(container: vscode.DocumentSymbol, findResult: vscode.DocumentSymbol[]): Promise<boolean> {
    let tokenFinded = false;
    let tokenFindedInChilds = false;

    if (await this.needGetSymbol(container)) {
      findResult.push(container);
      tokenFinded = true;
    }

    if (!(this.needOnlyOneResult && tokenFinded)) {
      for (const element of container.children) {
        const iterateTokenFindedInChild = await this.findSymbol(element, findResult);
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
   * @param documentUri Uri документа, в котором ищем.
   * @returns Массив с детальными описаниями.
   */
  public async localGetSymbols(documentUri: vscode.Uri): Promise<IElementDetail[]> {
    // TODO: что-то мне any[] не нравится. Мы вроде возвращаем IElementDetail[]?
    let result: any[] = [];

    this.documentUri = documentUri;
    const symbols = await VSCodeApi.getSymbols(this.documentUri);

    if (symbols.length) {
      for (const symbol of symbols) {
        this.parent = symbol.name;

        let findResult: vscode.DocumentSymbol[] = [];
        if (await this.findSymbol(symbol, findResult)) {
          result.push(
            ...findResult.map((element) => ({
              container: element,
              parent: this.parent,
            })),
          );
        }

        if (this.needOnlyOneResult && result.length) {
          break;
        }
      }
    }
    return Promise.resolve(result);
  }

  /**
   * Вернуть описания.
   * @param documentUri Uri документа, в котором ищем описание.
   * @param wrapperDescription Определение из обертки, на основе котрого ищем описание.
   * @returns Массив с детальными описаниями.
   */
  public static async getSymbols(
    documentUri: vscode.Uri,
    wrapperDescription: ProgrammingConstruct,
  ): Promise<IElementDetail[]>;
  // TODO: а тело метода куда делось?

  /**
   * Вернуть описания.
   * @param documentUri Uri документа, в котором ищем описание.
   * @param tokens Токены поиска.
   * @param range Диапазон поиска.
   * @returns Массив с детальными описаниями.
   */
  public static async getSymbols(
    documentUri: vscode.Uri,
    tokens: string,
    range: vscode.Range,
  ): Promise<IElementDetail[]>;
  // TODO: а тело метода куда делось?

  /**
   * Вернуть описания.
   * @param documentUri Uri документа, в котором ищем описание.
   * @param wrapperDescriptionOrToken Определение из обертки или токены поиска, на основе которых ищем описание.
   * @param range Диапазон поиска.
   * @returns Массив с детальными описаниями.
   */
  public static async getSymbols(
    documentUri: vscode.Uri,
    wrapperDescriptionOrToken: ProgrammingConstruct | string,
    range?: vscode.Range,
  ): Promise<IElementDetail[]> {
    let local;
    if (typeof wrapperDescriptionOrToken === 'string') {
      local = new SymbolSearcherByTokenAndRange(wrapperDescriptionOrToken, range!);
    } else {
      local = new SymbolSearcherByWrapperDescription(wrapperDescriptionOrToken);
    }
    return Promise.resolve(local.localGetSymbols(documentUri));
  }

  protected constructor() {}
}

/** Поисковик описания по токену и диапазону */
class SymbolSearcherByTokenAndRange extends SymbolSearcher {
  /** Токен для поиска. */
  private token: string;

  /** Диапазон поиска. */
  private range: vscode.Range;

  /**
   * Признак, что контейнер подходит под условия при сравнении с переданными токенами.
   * @param container Контейнер.
   * @returns true - если контейнер подходит под условия, иначе - false.
   */
  protected async needGetSymbol(container: vscode.DocumentSymbol): Promise<boolean> {
    if (this.token === container.name) {
      const location = container.selectionRange;
      return Promise.resolve(location.isEqual(this.range));
    }
    return Promise.resolve(false);
  }

  /**
   * Конструктор.
   * @param token Токен для поиска.
   * @param range Диапазон для поиска.
   */
  constructor(token: string, range: vscode.Range) {
    super();
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
   * @param position Позиция.
   * @returns Строка по переданной позиции.
   */
  private async getTextLine(position: vscode.Position): Promise<string> {
    if (!this.textLines.length) {
      this.textLines = await VSCodeApi.loadDocumentLine(this.documentUri!);
    }
    return Promise.resolve(this.textLines[position.line]);
  }

  /**
   * Признак, что контейнер подходит под условия при сравнении определением из обертки.
   * @param container Контейнер.
   * @returns true - если контейнер подходит под условия, иначе - false.
   */
  protected async needGetSymbol(container: vscode.DocumentSymbol): Promise<boolean> {
    const textLine = await this.getTextLine(container.selectionRange.start);
    return Promise.resolve(
      this.wrapperDescription.IsEqual({
        container: container,
        parent: this.parent!,
        textLine: textLine,
      }),
    );
  }

  /**
   * Конструктор.
   * @param wrapperDescription Описание программной конструкции.
   */
  constructor(wrapperDescription: ProgrammingConstruct) {
    super();
    this.wrapperDescription = wrapperDescription;
    this.needOnlyOneResult = false;
  }
}
