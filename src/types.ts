import * as vscode from 'vscode';
import { ProgrammingConstruct } from './constructs/programming-construct';
import { Resources } from './constructs/resources-construct';

/** Детальное описание элемента. */
export interface ElementDetail {
  container: vscode.DocumentSymbol;
  parent: NameAndDetail;
  uri: vscode.Uri;
  textLine?: string;
}

/** Описание с именем и детальными данными. */
export interface NameAndDetail {
  name: string;
  detail: string;
}

/** Информация из комментария. */
export interface InfoFromComment {
  uri: vscode.Uri | null;
  isInjection: boolean;
}

/** Интерфейс получения оригинальных определений. */
export interface IGetOriginalSymbols {
  /**
   * Получить оригинальные определения.
   * @param sourceLocation Исходное расположение.
   * @returns Массив оригинальных определений.
   */
  getOriginalSymbols(sourceLocation: vscode.Location): Promise<vscode.Location[]>;
}

/** Интерфейс получения определений. */
export interface IGetSymbols {
  /**
   * Получить {@link ElementDetail детальное описание элемента} или массив {@link vscode.Location расположений}.
   * @returns Детальное описание элмента или массив расположений.
   */
  getSymbols(): Promise<ElementDetail | vscode.Location[]>;
}

/** Словарь со списком строк с ключом по uri. */
export interface TextLinesByUri {
  [uri: string]: string[];
}

/**
 * Тип с поддержкой Uri из комментария.
 */
export interface SupportUriFromComment {
  uriFromComment: vscode.Uri;
  isEqual(element: ElementDetail): boolean;
};

/**
 * Создать объект в зависимости от его описания.
 * @param infoFromComment Uri из href-комментария.
 * @param symbol Описание.
 * @returns Возвращается созданный в зависимости от описания объект.
 */
export function createWrapperConstruct(
  infoFromComment: InfoFromComment,
  symbol: ElementDetail,
): IGetOriginalSymbols | null {
  if (infoFromComment.uri) {
    return ProgrammingConstruct.Create(infoFromComment, symbol);
  } else {
    return Resources.Create(symbol);
  }
}