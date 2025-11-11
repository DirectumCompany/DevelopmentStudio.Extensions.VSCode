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

/** Интерфейс получения оригинального определения. */
export interface IGetOriginalSymbols {
  /**
   * Получить оригинальное определение.
   * @param sourceLocation Исходное расположение.
   * @returns Массив оригинальных определений.
   */
  getOriginalSymbols(sourceLocation: vscode.Location): Promise<ElementDetail[]>;
}