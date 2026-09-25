/* eslint-disable jsdoc/check-param-names */
/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-confusing-non-null-assertion */
/* eslint-disable @typescript-eslint/array-type */
/* eslint-disable jsdoc/multiline-blocks */
/* eslint-disable jsdoc/require-param */
import * as vscode from 'vscode';
import { ElementDetail, InfoFromComment, IGetOriginalSymbols, SupportUriFromComment } from '../types';
import { SymbolSearcherByHrefComment } from '../searchers/symbol-searcher-by-comment';
import { getDescriptionWithTypeAliases, getOnlyName } from '../utils';

/** Описание программной конструкции. */
export class ProgrammingConstruct implements IGetOriginalSymbols, SupportUriFromComment {
  /** Вид. */
  protected kind: vscode.SymbolKind;

  /** Только имя, без типов параметров и возвращаемого значения. Пример: `HasDocumentRegistersByDocument`. */
  protected name: string;

  /** Детальное описание, включает типы параметров и возвращаемое значение. Пример: `HasDocumentRegistersByDocument(IOfficialDocument, Enumeration?) : bool`.*/
  public detail: string;

  /** Uri из комментария. */
  public uriFromComment: vscode.Uri;

  /**
   * Создать объект в зависимости от его типа.
   * @param symbol Описание.
   * @returns Возвращается созданный в зависимости от описания объект.
   */
  public static Create(infoFromComment: InfoFromComment, symbol: ElementDetail): IGetOriginalSymbols {
    switch (symbol.container.kind) {
      case vscode.SymbolKind.Method: {
        return new Function(infoFromComment, symbol);
      }
      case vscode.SymbolKind.Property: {
        return new Property(infoFromComment.uri!, symbol);
      }
      case vscode.SymbolKind.Interface: {
        return new Structure(infoFromComment.uri!, symbol);
      }
      default: {
        return new ProgrammingConstruct(infoFromComment.uri!, symbol);
      }
    }
  }

  /**
   * Признак соответствует ли имя критериям. Критерии для класса могут быть свои.
   * @param element Элемент для сравнения.
   * @returns true - если имя соответствует, иначе false.
   */
  protected isNameMatchesCriteria(element: ElementDetail): boolean {
    return element.container.name.startsWith(this.name);
  }

  /**
   * Признак, что детальная информация переданного для сравнения элемента равна текущей детальной информации.
   * @param element Элемент для сравнения.
   * @returns true - если элемент равен текущему, иначе false.
   */
  protected isDetailEqual(element: ElementDetail): boolean {
    // Сравнение для всех остальных.
    return element.container.detail === this.detail;
  }

  /**
   * Создает описание из враппера.
   * @param uriFromComment Uri из href-комментария.
   * @param symbol Элемент с дополнительной информацией.
   */
  constructor(uriFromComment: vscode.Uri, symbol: ElementDetail) {
    this.name = getOnlyName(symbol.container);
    this.detail = getDescriptionWithTypeAliases(symbol.container);
    this.kind = symbol.container.kind;
    this.uriFromComment = uriFromComment;
  }

  /** Признак, что переданный для сравнения элемент равен текущему.
   * @param element Элемент для сравнения. `ElementDetail.container.name` и `ElementDetail.container.detail` одинаковы и приходят с типами параметров и возвращаемым значением.
   * @returns true - если элемент равен текущему, иначе false.
   */
  public isEqual(element: ElementDetail): boolean {
    return this.isNameMatchesCriteria(element) && this.isDetailEqual(element);
  }

  public async getOriginalSymbols(): Promise<vscode.Location[]> {
    return await this.getOriginalSymbolByHrefComment(this);
  }

  /**
   * Вернуть описания по ссылке из комментария.
   * @param wrapperDescription Определение из обертки, на основе которого ищем описание.
   * @returns Массив с детальными описаниями.
   */
  public async getOriginalSymbolByHrefComment(wrapperDescription: SupportUriFromComment): Promise<vscode.Location[]> {
    const local = new SymbolSearcherByHrefComment(wrapperDescription);
    if (local) {
      const symbols = await local.getSymbols();
      if (Array.isArray(symbols)) {
        return Promise.resolve(symbols);
      }
    }
    return Promise.resolve([]);
  }
}

/** Описание элемента структуры или константы. */
class Property extends ProgrammingConstruct {
  /** Имя предка. */
  protected parent?: string;

  /** Цепочка типов-контейнеров (без namespace). */
  private readonly containerTypeNames: string[];

  /**
   * Признак, что переданный для сравнения элемент равен текущему.
   * @param element Элемент для сравнения.
   * @returns true - если элемент равен текущему, иначе false.
   */
  protected isDetailEqual(element: ElementDetail): boolean {
    switch (element.container.kind) {
      case vscode.SymbolKind.Property: {
        return (
          this.parent!.startsWith('I') &&
          this.parent!.substring(1) === element.parent.name &&
          element.container.detail === this.detail
        );
      }
      case vscode.SymbolKind.Constant:
      case vscode.SymbolKind.Field: {
        // Тип у обёртки и оригинала может отличаться, поэтому сравниваем имя и цепочку типов-контейнеров.
        return (
          this.parent! === element.parent.name &&
          Property.isSameContainerTypes(this.containerTypeNames, element.containerTypeNames ?? [])
        );
      }
      default: {
        return this.parent! === element.parent.name && super.isDetailEqual(element);
      }
    }
  }

  /**
   * Совпадают ли цепочки типов-контейнеров.
   * @param left Первая цепочка.
   * @param right Вторая цепочка.
   * @returns true - если цепочки одинаковы.
   */
  private static isSameContainerTypes(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((name, index) => name === right[index]);
  }

  constructor(uriFromComment: vscode.Uri, symbol: ElementDetail) {
    super(uriFromComment, symbol);
    this.parent = symbol.parent.name;
    this.containerTypeNames = symbol.containerTypeNames ?? [];
  }
}

/** Описание структуры. */
class Structure extends ProgrammingConstruct {
  /** Имена для поиска. */
  private searchNames: string[] = [];

  /** Детальное описание структуры без префикса. */
  private structureWithoutPrefix?: string;

  /**
   * Добавить токены для поиска.
   * @description Используется для добавления вариаций поиска для структур.
   */
  private addTokensForSearch() {
    this.searchNames = [this.name];
    if (this.name.startsWith('I')) {
      this.searchNames.push(this.name.substring(1));
    }
  }

  /**
   * Вернуть детальное описание без префикса.
   * @returns Детальное описание структуры без префикса "I".
   * @description Используется для структур.
   * Пример того, что подается на вход: 'IArioFact'.
   * На выходе должно получиться: 'ArioFact'.
   */
  private getStructureWithoutPrefix(): string {
    if (!this.structureWithoutPrefix) {
      this.structureWithoutPrefix = this.detail.substring(1);
    }
    return this.structureWithoutPrefix;
  }

  /**
   * Признак соответствует ли имя критериям. Критерии для класса могут быть свои.
   * @param element Элемент для сравнения.
   * @returns true - если имя соответствует, иначе false.
   */
  protected isNameMatchesCriteria(element: ElementDetail): boolean {
    return this.searchNames.includes(element.container.name);
  }

  /**
   * Признак, что переданный для сравнения элемент равен текущему.
   * @param element Элемент для сравнения.
   * @returns true - если элемент равен текущему, иначе false.
   */
  protected isDetailEqual(element: ElementDetail): boolean {
    return (
      element.container.kind === vscode.SymbolKind.Class &&
      element.container.detail === this.getStructureWithoutPrefix()
    );
  }

  constructor(uriFromComment: vscode.Uri, symbol: ElementDetail) {
    super(uriFromComment, symbol);
    this.addTokensForSearch();
  }
}

/** Описание функции. */
class Function extends ProgrammingConstruct {
  /** Детальное описание функции без первого параметра. */
  private functionWithoutFirstParam?: string;

  /** Признак, что описание функции из инъекции. */
  private isInjection?: boolean;

  /**
   * Вернуть описание функции без первого параметра.
   * @returns Описание функции без первого параметра.
   * @description На вход поступает: 'GetExtensionValidationError(IOfficialDocument, String)'.
   * На выходе ожидаем: 'GetExtensionValidationError(String)'.
   */
  private getFunctionWithoutFirstParam(): string {
    if (!this.functionWithoutFirstParam) {
      let definition = this.detail;
      definition = definition.replace(/(\()([\w.<>]+)\s*(,)?\s*/, '$1');
      this.functionWithoutFirstParam = definition.toString();
    }
    return this.functionWithoutFirstParam;
  }

  /**
   * Сравнить без учета параметров по умолчанию.
   * @param detail Детальное описание с параметрами по умолчанию.
   * @returns true - если переданное детальное описание, без учета параметров по умолчанию
   * равно текущему детальному описанию, иначе false.
   */
  private getWithoutDefaultParams(detail: string): string {
    const result: string[] = [];
    let params = detail.substring(detail.indexOf('(') + 1, detail.lastIndexOf(')'));
    params.split(',').forEach((s) => result.push(s.split('=')[0].trimEnd()));
    return detail.replace(params, result.join(','));
  }

  /** Признак, что функция статическая.
   * @param textLine Строка описания.
   * @returns true - если функция статическая, иначе - false.
   */
  private isStatic(textLine: string): boolean {
    return textLine?.split(/\s/).includes('static');
  }

  /**
   * Вернуть описание функции для сравнения.
   * @param element Элемент для сравнения.
   * @returns Описание функции для сравнения.
   */
  private getFunctionDetailForCompare(element: ElementDetail): string {
    // Если функция инъекции, изолированная, функция модуля, инициализации или статическая, то первый параметр должен остаться.
    if (
      this.isInjection ||
      ['IsolatedFunctions', 'ModuleFunctions', 'ModuleInitializer'].includes(element.parent.name) ||
      this.isStatic(element.textLine!)
    ) {
      return this.detail;
    }
    return this.getFunctionWithoutFirstParam();
  }

  /**
   * Признак, что переданный для сравнения элемент равен текущему.
   * @param element Элемент для сравнения.
   * @returns true - если элемент равен текущему, иначе false.
   */
  protected isDetailEqual(element: ElementDetail): boolean {
    // Сравнение для функций
    if (element.container.kind === vscode.SymbolKind.Method) {
      const functionDetail = this.getFunctionDetailForCompare(element);
      return (
        element.container.detail === functionDetail ||
        this.getWithoutDefaultParams(element.container.detail) === functionDetail
      );
    }
    return super.isDetailEqual(element);
  }

  constructor(infoFromComment: InfoFromComment, symbol: ElementDetail) {
    super(infoFromComment.uri!, symbol);
    this.isInjection = infoFromComment.isInjection;
  }
}
