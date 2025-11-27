import * as vscode from 'vscode';
import * as VSCodeApi from '../vscode-api';
import { IGetSymbols, SupportTextFormatSearch, TextLinesByUri } from '../types';

/** Поисковик описания по текстовым файлам. */
export class TextFormatSearcher implements IGetSymbols {
  /** Определение из обертки. */
  protected wrapperDescription: SupportTextFormatSearch;

  /** Uri документа. */
  protected documentUris: vscode.Uri[];

  /** Словарь строк документа по Uri. */
  private textLinesByUriDictionary: TextLinesByUri;

  /**
   * Конструктор.
   * @param uris Массив Uri документов.
   * @param wrapperDescription Описание программной конструкции.
   */
  public constructor(uris: vscode.Uri[], wrapperDescription: SupportTextFormatSearch) {
    this.wrapperDescription = wrapperDescription;
    this.documentUris = uris;
    this.textLinesByUriDictionary = {};
  }

  public async getSymbols(): Promise<vscode.Location[]> {
    const result: vscode.Location[] = [];
    for (const currentUri of this.documentUris) {
      const symbolRange = await this.GetRange(currentUri);
      if (symbolRange) {
        result.push({
          range: symbolRange,
          uri: currentUri,
        });
      }
    }
    return Promise.resolve(result);
  }

  /**
   * Получить диапазон.
   * @param uri Uri, где надо вести поиск.
   * @returns Диапазон найденной строки или null, если строку найти не удалось.
   */
  private async GetRange(uri: vscode.Uri): Promise<vscode.Range | null> {
    const textLines = await this.getTextLinesByUri(uri);
    const index = textLines.findIndex((s) => this.wrapperDescription.isEqual(s));
    if (index > 0) {
      const startCharacter = textLines[index].indexOf(this.wrapperDescription.name);
      return Promise.resolve(
        new vscode.Range(index, startCharacter, index, startCharacter + this.wrapperDescription.name.length),
      );
    }
    return Promise.resolve(null);
  }

  /**
   * Вернуть список строк по Uri.
   * @param uri Uri документа.
   * @returns Массив строк из документа по указанному Uri.
   */
  private async getTextLinesByUri(uri: vscode.Uri): Promise<string[]> {
    const index = uri.path;
    if (!this.textLinesByUriDictionary[index] || this.textLinesByUriDictionary[index].length === 0) {
      this.textLinesByUriDictionary[index] = await VSCodeApi.loadDocumentLines(uri);
    }
    return Promise.resolve(this.textLinesByUriDictionary[index]);
  }
}
