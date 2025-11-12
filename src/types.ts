import * as vscode from 'vscode';

/** Детальное описание элемента. */
export type ElementDetail = {
  container: vscode.DocumentSymbol;
  parent: string;
  uri: vscode.Uri;
  textLine?: string;
};

/** Информация из комментария. */
export type InfoFromComment = {
  uri: vscode.Uri | null;
  isInjection: boolean;
};

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
export type TextLinesByUri = {
  [uri: string]: string[];
};