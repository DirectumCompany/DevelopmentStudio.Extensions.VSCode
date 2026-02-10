/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable jsdoc/require-jsdoc */
/* eslint-disable @typescript-eslint/array-type */
/* eslint-disable import/order */
import * as vscode from 'vscode';
import fs from 'fs';
import * as VSCodeApi from '../vscode-api';
import { ElementDetail, SupportTextFormatSearch } from '../types';
import { TextFormatSearcher } from '../searchers/searcher-resources-or-queries';

/** Класс для создания описания элемента ресурсной строки. */
export class Resources {
  /**
   * Создать объект в зависимости от его типа.
   * @param symbol Описание.
   * @returns Возвращается созданный в зависимости от описания объект или null, если описание не подошло под условия создания.
   */
  public static Create(symbol: ElementDetail): SupportTextFormatSearch | null {
    if (
      symbol.parent.name.endsWith('Resources') &&
      [vscode.SymbolKind.Method, vscode.SymbolKind.Property].includes(symbol.container.kind)
    ) {
      return symbol.uri.fsPath.endsWith('Module.g.cs')
        ? new ResourceModuleOrSolution(symbol)
        : new ResourceEntityOrReport(symbol);
    }
    return null;
  }
}

/** Описание элемента ресурсной строки сущности или отчета. */
class ResourceEntityOrReport implements SupportTextFormatSearch {
  /** Имя. */
  public name: string;

  /**
   * Конструктор.
   * @param symbol Элемент с дополнительной информацией.
   */
  public constructor(symbol: ElementDetail) {
    this.name = symbol.container.name.replace(/(\w*)Format/, '$1');
  }

  public async getOriginalSymbols(sourceLocation: vscode.Location): Promise<vscode.Location[]> {
    return await this.getResourceStringLocations(sourceLocation);
  }

  /**
   * Проверить, что переданная строка содержит имя искомой ресурсной строки.
   * @param line Строка, в которой будет проводиться поиск.
   * @returns true - если строка содержит ресурсную строку, иначе false.
   */
  public isEqual(line: string): boolean {
    return line.trim().startsWith(`<data name="${this.name}"`);
  }

  /**
   * Вернуть {@link vscode.Location расположение}.
   * @param sourceLocation Исходное расположение.
   * @returns Расположение.
   */
  protected async getLocation(sourceLocation: vscode.Location): Promise<vscode.Location> {
    return Promise.resolve(sourceLocation);
  }

  /**
   * Вернуть расположения ресурсной строки.
   * @param sourceLocation Исходное {@link vscode.Location расположение}.
   * @returns Массив с {@link vscode.Location расположениями}.
   */
  private async getResourceStringLocations(sourceLocation: vscode.Location): Promise<vscode.Location[]> {
    const result = [];
    const documentUris = await this.getSearchUris(sourceLocation);
    const local = new TextFormatSearcher(documentUris, this);
    const symbols = await local.getSymbols();
    result.push(...symbols);
    return Promise.resolve(result);
  }

  /**
   * Вернуть массив Uri для поиска элемента.
   * @param sourceLocation Исходное {@link vscode.Location расположение}.
   * @returns Массив Uri для поиска элемента.
   */
  private async getSearchUris(sourceLocation: vscode.Location): Promise<vscode.Uri[]> {
    const location = await this.getLocation(sourceLocation);
    const currentImplementations = await VSCodeApi.getImplementations(location.uri, location.range.start);
    if (currentImplementations.length > 0) {
      const currentImplementation =
        this.getNearestLocation(sourceLocation, currentImplementations) ?? currentImplementations.pop()!;
      return this.getResourcesUris(currentImplementation.uri);
    }
    return [location.uri];
  }

  /**
   * Получить ближайшее {@link vscode.Location расположение}.
   * @param location {@link vscode.Location Расположение}, рядом с которым ищем.
   * @param implementations Массив {@link vscode.Location расположений}, в которых ищем.
   * @returns Ближайшее {@link vscode.Location расположение}.
   */
  private getNearestLocation(location: vscode.Location, implementations: vscode.Location[]): vscode.Location | null {
    function commonPrefixLength(a: string, b: string): number {
      const len = Math.min(a.length, b.length);
      let i: number;
      for (i = 0; i < len; i++) {
        if (a.charCodeAt(i) !== b.charCodeAt(i)) {
          return i;
        }
      }
      return len;
    }

    const nearest = implementations
      .map((value, index) => {
        return {
          index,
          prefixLen: commonPrefixLength(value.uri.toString().toLowerCase(), location.uri.toString().toLowerCase()),
        };
      })
      .sort((a, b) => {
        if (a.prefixLen > b.prefixLen) {
          return -1;
        }
        return a.prefixLen < b.prefixLen ? 1 : 0;
      })[0];
    if (nearest) {
      return implementations[nearest.index];
    }
    return null;
  }

  /**
   * Вернуть массив Uri ресурсных файлов.
   * @param uri Исходный Uri.
   * @returns Массив Uri ресурсных файлов.
   */
  private getResourcesUris(uri: vscode.Uri): vscode.Uri[] {
    const uris: vscode.Uri[] = [];

    const resourcesLanguageDefault = vscode.workspace
      .getConfiguration()
      .get<string>('sungero.resourseLanguageDefault')!;
    const settingExtensionPairs = [
      { setting: 'en', extension: '.resx' },
      { setting: 'ru', extension: '.ru.resx' },
    ];
    settingExtensionPairs.sort((first) => (first.setting === resourcesLanguageDefault ? -1 : 1));

    const sourcePath = uri.fsPath;
    const checkedExtension = '.g.cs';
    if (sourcePath.endsWith(checkedExtension)) {
      const pathWithoutExtension = sourcePath.substring(0, sourcePath.length - checkedExtension.length);
      const resourceFilePaths: string[] = settingExtensionPairs.map((item) => pathWithoutExtension + item.extension);
      for (const filePath of resourceFilePaths) {
        if (fs.existsSync(filePath)) {
          uris.push(vscode.Uri.file(filePath));
        }
      }
    }
    return uris;
  }
}

/** Описание элемента ресурсной строки модуля или решения. */
class ResourceModuleOrSolution extends ResourceEntityOrReport {
  /** Детальное описание элемента. */
  protected symbol: ElementDetail;

  /**
   * Конструктор.
   * @param symbol Элемент с дополнительной информацией.
   */
  public constructor(symbol: ElementDetail) {
    super(symbol);
    this.symbol = symbol;
  }

  protected async getLocation(sourceLocation: vscode.Location): Promise<vscode.Location> {
    try {
      const newPosition = await this.getPositionDiff();
      const position = new vscode.Position(
        this.symbol.container.range.start.line + newPosition.lineOffset,
        newPosition.characterStart,
      );
      return new vscode.Location(this.symbol.uri, position);
    } catch {
      return sourceLocation;
    }
  }

  /**
   * Вернуть смещение строки и позицию.
   * @returns Смещение строки и позиция.
   */
  private async getPositionDiff(): Promise<{ lineOffset: number; characterStart: number }> {
    const ReturnResourceString = 'return resources.';
    const block = await this.getBlockCode();
    const index = block.findIndex((item) => item.includes(ReturnResourceString));
    return { lineOffset: index, characterStart: block[index].indexOf('.') + 1 };
  }

  /**
   * Вернуть блок кода.
   * @returns Блок кода.
   */
  private async getBlockCode(): Promise<string[]> {
    const block = await vscode.workspace
      .openTextDocument(this.symbol.uri)
      .then(async (s) => s.getText(this.symbol.container.range).split('\n'));
    return block;
  }
}
