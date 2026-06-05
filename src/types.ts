/* eslint-disable @typescript-eslint/consistent-indexed-object-style */
/* eslint-disable @typescript-eslint/array-type */
/* eslint-disable jsdoc/require-jsdoc */
import * as vscode from 'vscode';
import { ProgrammingConstruct } from './constructs/programming-construct';
import { Resources } from './constructs/resources-construct';
import { Queries } from './constructs/queries-construct';

/** Детальное описание элемента. */
export interface ElementDetail {
  container: vscode.DocumentSymbol;
  parent: NameAndDetail;
  namespace?: string;
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

/** Интерфейс исходного расположения. */
export interface ISourceLocation {
  /** Документ, где была вызвана команда. */
  document: vscode.TextDocument;
  /** Позиция, где была вызвана команда. */
  position: vscode.Position;
}

/** Интерфейс получения оригинальных определений. */
export interface IGetOriginalSymbols {
  /** Исходное расположение. */
  sourceLocation?: ISourceLocation;
  /**
   * Получить оригинальные определения.
   * @returns Массив оригинальных определений.
   */
  getOriginalSymbols(): Promise<vscode.Location[]>;
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
}

/**
 * Интерфейс получения оригинальных определений с поддержкой поиска в текстовом формате.
 */
export interface SupportTextFormatSearch extends IGetOriginalSymbols {
  name: string;
  isEqual(line: string): boolean;
}

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
  const wrapper = Resources.Create(infoFromComment.uri, symbol);
  if (wrapper) return wrapper;
  if (infoFromComment.uri) {
    return ProgrammingConstruct.Create(infoFromComment, symbol);
  } else {
    return Queries.Create(symbol);
  }
}
