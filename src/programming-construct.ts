import * as vscode from 'vscode';
import { IElementDetail } from './symbol-searcher';

/** Описание программной конструкции. */
export class ProgrammingConstruct {
  /** Вид. */
  protected kind: vscode.SymbolKind;

  /** Имя. */
  protected name: string;

  /** Детальное описание. */
  public detail: string;

  /** Имя предка. */
  protected parent?: string;

  /** Проверить равенство по именам. */
  protected isNameEqual(element: IElementDetail): boolean {
    return this.name === element.container.name;
  }

  /**
   * Признак, что детальная информация переданного для сравнения элемента равна текущей детальной информации.
   * @param element Элемент для сравнения.
   * @returns true - если элемент равен текущему, иначе false.
   */
  protected isDetailEqual(element: IElementDetail): boolean {
    // Сравнение для всех остальных.
    return element.container.detail === this.detail;
  }

  /**
   * Создает описание из враппера.
   * @param symbol Элемент с дополнительной информацией.
   */
  protected constructor(symbol: IElementDetail) {
    this.name = symbol.container.name;
    this.kind = symbol.container.kind;
    this.detail = symbol.container.detail;
    this.parent = symbol.parent;
  }

  /** Признак, что переданный для сравнения элемент равен текущему.
   * @param element Элемент для сравнения.
   * @returns true - если элемент равен текущему, иначе false.
   */
  public IsEqual(element: IElementDetail): boolean {
    return this.isNameEqual(element) && this.isDetailEqual(element);
  }

  /**
   * Создать объект в зависимости от его типа.
   * @param symbol Описание.
   * @returns Возвращается созданный в зависимости от описания объект.
   */
  public static Create(symbol: IElementDetail): ProgrammingConstruct {
    switch (symbol.container.kind) {
      case vscode.SymbolKind.Method: {
        return new Function(symbol);
      }
      case vscode.SymbolKind.Property:
      case vscode.SymbolKind.Interface: {
        return new Structure(symbol);
      }
      default: {
        return new ProgrammingConstruct(symbol);
      }
    }
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
   * Пример того, что подается на вход: 'Sungero.Commons.Structures.Module.IArioFact'.
   * На выходе должно полчиться: 'Sungero.Commons.Structures.Module.ArioFact'.
   */
  private getStructureWitoutPrefix(): string {
    if (!this.structureWithoutPrefix) {
      this.structureWithoutPrefix = this.detail.replace(/(\.)I([^.]*)$/, '$1$2');
    }
    return this.structureWithoutPrefix;
  }

  /**
   * Проверить равеноство по именам.
   * @param element Элемент для сравнения.
   * @returns true - если элемент равен текщуему, иначе false.
   */
  protected isNameEqual(element: IElementDetail): boolean {
    return this.searchNames.includes(element.container.name);
  }

  /**
   * Признак, что переданный для сравнения элемент равен текущему.
   * @param element Элемент для сравнения.
   * @returns true - если элемент равен текущему, иначе false.
   */
  protected isDetailEqual(element: IElementDetail): boolean {
    switch (element.container.kind) {
      case vscode.SymbolKind.Class: {
        return element.container.detail === this.getStructureWitoutPrefix();
      }
      case vscode.SymbolKind.Property: {
        return (
          (element.parent === this.parent || this.parent!.search(`^I${element.parent}$`) > -1) &&
          element.container.detail === this.detail
        );
      }
      default: {
        return super.isDetailEqual(element);
      }
    }
  }

  constructor(symbol: IElementDetail) {
    super(symbol);
    this.addTokensForSearch();
  }
}

/** Описание функции. */
class Function extends ProgrammingConstruct {
  /** Детальное описание функции без первого параметра. */
  private functionWithoutFirstParam?: string;

  /**
   * Вернуть описание функции без первого параметра.
   * @returns Описание функции без первого параметра.
   * @description На вход поступает: 'GetExtensionValidationError(IOfficialDocument officialDocument, String extension)'.
   * На выходе ожидаем: 'GetExtensionValidationError(String extension)'.
   */
  private getFunctionWithoutFirstParam(): string {
    if (!this.functionWithoutFirstParam) {
      let definition = this.detail;
      definition = definition.replace(/(\()([\w.<>]+)\s(\w+)(,)?\s*/, '$1');
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
  private getFunctionDetailForCompare(element: IElementDetail): string {
    // Если функция изолированная, функция модуля или статическая, то первый параметр должен остаться.
    if (['IsolatedFunctions', 'ModuleFunctions'].includes(element.parent) || this.isStatic(element.textLine!)) {
      return this.detail;
    }
    return this.getFunctionWithoutFirstParam();
  }

  /**
   * Признак, что переданный для сравнения элемент равен текущему.
   * @param element Элемент для сравнения.
   * @returns true - если элемент равен текущему, иначе false.
   */
  protected isDetailEqual(element: IElementDetail): boolean {
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
}
