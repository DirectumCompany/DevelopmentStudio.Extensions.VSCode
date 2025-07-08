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

  /** Проверить равеноство по именам. */
  protected isNameEqual(element: IElementDetail): boolean {
    return this.name === element.container.name;
  }

  /**
   * Признак, что детальная информация переданного для сравнения элемента равна текущей детальной информации.
   * @param element Элемент для сравнения.
   */
  protected isDeatilEqual(element: IElementDetail): boolean {
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
   */
  public IsEqual(element: IElementDetail): boolean {
    if (this.isNameEqual(element)) {
      return this.isDeatilEqual(element);
    }
    return false;
  }

  /**
   * Создать объект в зависимости от его типа.
   * @param symbol Описание.
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
  private structureWitoutPrefix?: string;

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
   * @description Используется для структур.
   */
  private getStructureWitoutPrefix() {
    if (!this.structureWitoutPrefix) {
      this.structureWitoutPrefix = this.detail.replace(/(\.)I([^.]*)$/, '$1$2');
    }
    return this.structureWitoutPrefix;
  }

  /** Проверить равеноство по именам. */
  protected isNameEqual(element: IElementDetail): boolean {
    return this.searchNames.includes(element.container.name);
  }

  /**
   * Признак, что переданный для сравнения элемент равен текущему.
   * @param element Элемент для сравнения.
   */
  protected isDeatilEqual(element: IElementDetail): boolean {
    // Сравнение для структур: при объявлении в обертке - интерфес, при объявлении в структурах на прикладной - класс.
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
        return super.isDeatilEqual(element);
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

  /** Вернуть описание функции без первого параметра. */
  private getFunctionWithoutFirstParam() {
    if (!this.functionWithoutFirstParam) {
      let definition = this.detail.substring(this.detail.lastIndexOf('.', this.detail.indexOf('(')) + 1);
      definition = definition.substring(0, definition.indexOf(')') + 1);
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
  private getWithoutDefaultParams(detail: string) {
    const result: string[] = [];
    let params = detail.substring(detail.indexOf('(') + 1, detail.lastIndexOf(')'));
    params.split(',').forEach((s) => result.push(s.split('=')[0].trimEnd()));
    return detail.replace(params, result.join(','));
  }

  /** Признак, что функция статическая.
   * @param textLine Строка описания.
   */
  private isStatic(textLine: string) {
    return textLine?.split(/\s/).includes('static');
  }

  /**
   * Вернуть описание функции для сравнения.
   * @param element Элемент для сравнения.
   */
  private getFunctionDetailForCompare(element: IElementDetail): string {
    // Если функция изолированная, функция модуля или статическая, то первый параметр должен остаться.
    if (['IsolatedFunctions', 'ModuleFunctions'].includes(element.parent) || this.isStatic(element.textLine!)) {
      return this.detail;
    } else {
      return this.getFunctionWithoutFirstParam();
    }
  }

  /**
   * Признак, что переданный для сравнения элемент равен текущему.
   * @param element Элемент для сравнения.
   */
  protected isDeatilEqual(element: IElementDetail): boolean {
    // Сравнение для функций
    if (element.container.kind === vscode.SymbolKind.Method) {
      const functionDetail = this.getFunctionDetailForCompare(element);
      return (
        element.container.detail === functionDetail ||
        this.getWithoutDefaultParams(element.container.detail) === functionDetail
      );
    }
    return super.isDeatilEqual(element);
  }
}
