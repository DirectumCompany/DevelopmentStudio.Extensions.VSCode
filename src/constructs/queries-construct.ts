/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/array-type */
/* eslint-disable import/order */
import * as vscode from 'vscode';
import fs from 'fs';
import path from 'path';
import { ElementDetail, IGetOriginalSymbols, SupportTextFormatSearch } from '../types';
import { TextFormatSearcher } from '../searchers/searcher-resources-or-queries';
import { getOnlyName, isWrapperFile } from '../utils';

/** Описание элемента запроса */
export class Queries implements SupportTextFormatSearch {
  /** Имя. */
  public readonly name: string;

  /** Исходное расположение элемента. */
  private readonly sourcePath: string;

  /**
   * Создать объект в зависимости от его типа.
   * @param symbol Описание.
   * @returns Возвращается созданный в зависимости от описания объект или null, если описание не подошло под условия создания.
   */
  public static Create(symbol: ElementDetail): IGetOriginalSymbols | null {
    if (
      symbol.namespace?.split('.').includes('Queries') &&
      [vscode.SymbolKind.Property].includes(symbol.container.kind)
    ) {
      return new Queries(symbol);
    }
    return null;
  }

  /**
   * Конструктор.
   * @param symbol Элемент с дополнительной информацией.
   */
  private constructor(symbol: ElementDetail) {
    this.name = getOnlyName(symbol.container);
    this.sourcePath = symbol.uri.fsPath;
  }

  public async getOriginalSymbols(): Promise<vscode.Location[]> {
    return await this.getQueriesLocations();
  }

  /**
   * Проверить, что переданная строка содержит имя искомой строки запроса.
   * @param line Строка, в которой будет проводиться поиск.
   * @returns true - если строка содержит строку запроса, иначе false.
   */
  public isEqual(line: string): boolean {
    return line.trim().startsWith(`<query key="${this.name}"`);
  }

  /**
   * Вернуть расположения запроса.
   * @returns Массив с {@link vscode.Location расположениями}.
   */
  private async getQueriesLocations(): Promise<vscode.Location[]> {
    const result = [];
    const queriesFiles = this.getExistingUris(this.getSeparatedQueryFiles);
    if (queriesFiles.length > 0) {
      result.push(
        ...queriesFiles.map((item) => new vscode.Location(vscode.Uri.file(item.fsPath), new vscode.Position(0, 0))),
      );
    } else {
      const documentUri = this.getExistingUris((sourcePath) => [sourcePath.replace(/\.g\.cs$/, 'Queries.g.xml')]);
      if (documentUri) {
        const local = new TextFormatSearcher(documentUri, this);
        const symbols = await local.getSymbols();
        result.push(...symbols);
      }
    }
    return result;
  }

  /**
   * Вернуть отдельные файлы запросов.
   * @param sourcePath Исходное расположение элемента.
   * @param name Имя элемента.
   * @returns Массив отдельных файлов запросов, с учетом настройки предпочтительного типа.
   */
  private getSeparatedQueryFiles(sourcePath: string, name: string): string[] {
    const queryTypeDefault = vscode.workspace.getConfiguration().get<string>('sungero.queryTypeDefault')!;
    const settingExtensionPairs = [
      { setting: 'postgres', postfix: '_postgres.sql' },
      { setting: 'mssql', postfix: '_mssql.sql' },
      { setting: '', postfix: '.sql' },
    ];
    settingExtensionPairs.sort((first) => (first.setting === queryTypeDefault ? -1 : 1));
    const dirname = path.dirname(sourcePath);
    const queryPaths: string[] = settingExtensionPairs.map((item) =>
      path.join(dirname, 'Queries', name + item.postfix),
    );
    return queryPaths;
  }

  /**
   * Вернуть массив Uri с существующими файлами.
   * @param getter Получатель массива Uri, который проверяется.
   * @returns Массив Uri с существующими файлами.
   */
  private getExistingUris(getter: (path: string, name: string) => string[]): vscode.Uri[] {
    const uris: vscode.Uri[] = [];
    if (isWrapperFile(vscode.Uri.file(this.sourcePath))) {
      const queryPaths = getter(this.sourcePath, this.name);
      for (const filePath of queryPaths) {
        if (fs.existsSync(filePath)) {
          uris.push(vscode.Uri.file(filePath));
        }
      }
    }
    return uris;
  }
}
