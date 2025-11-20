import * as vscode from 'vscode';
import fs from 'fs';
import path from 'path';
import * as VSCodeApi from '../vscode-api';
import { ElementDetail, IGetOriginalSymbols } from '../types';
import { ResourcesSearcher } from '../searchers/searcher-resources';
import { DocumentSymbolLoader } from '../symbol-loader';

/** Класс для создания описания элемента ресурсной строки. */
export class Resources {
  /**
   * Создать объект в зависимости от его типа.
   * @param symbol Описание.
   * @returns Возвращается созданный в зависимости от описания объект или null, если описание не подошло под условия создания.
   */
  public static Create(symbol: ElementDetail): IGetOriginalSymbols | null {
    if (
      symbol.parent.endsWith('Resources') &&
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
export class ResourceEntityOrReport implements IGetOriginalSymbols {
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
    return await this.getOriginalSymbolResourceString(sourceLocation);
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
   * Вернуть {@link vscode.Location расположение} и описание элемента.
   * @param sourceLocation Исходное расположение.
   * @returns Расположение и описание элемента или null, если расположение найти не удалось.
   */
  protected async getLocationAndWrapperProgrammingConstruct(sourceLocation: vscode.Location): Promise<{
    location: vscode.Location;
    wrapperProgrammingConstruct: ResourceEntityOrReport;
  } | null> {
    return Promise.resolve({ location: sourceLocation, wrapperProgrammingConstruct: this });
  }

  /**
   * Вернуть расположение ресурсной строки.
   * @param sourceLocation Исходное {@link vscode.Location местоположение}.
   * @returns Массив {@link vscode.Location расположений}.
   */
  private async getOriginalSymbolResourceString(sourceLocation: vscode.Location): Promise<vscode.Location[]> {
    let originalSymbols: vscode.Location[] = [];
    const data = await this.getLocationAndWrapperProgrammingConstruct(sourceLocation);
    if (data) {
      originalSymbols = await this.getResourceStringLocations(data.location, data.wrapperProgrammingConstruct);
    }
    return Promise.resolve(originalSymbols);
  }

  /**
   * Вернуть расположения ресурсной строки.
   * @param location Исходное {@link vscode.Location местоположение}.
   * @param wrapperDescription {@link ResourceEntityOrReport Определение} из обертки, на основе которого ищем описание.
   * @returns Массив с {@link vscode.Location расположениями}.
   */
  private async getResourceStringLocations(
    location: vscode.Location,
    wrapperDescription: ResourceEntityOrReport,
  ): Promise<vscode.Location[]> {
    const result = [];
    const documentUri = await this.getImplementationUris(location);
    const local = new ResourcesSearcher(documentUri, wrapperDescription);
    const symbols = await local.getSymbols();
    result.push(...symbols);
    return Promise.resolve(result);
  }

  /**
   * Вернуть Uri файлов, где расположена реализация элемента.
   * @param location Исходное расположение элемента.
   * @returns Uri файлов, где расположена реализация.
   */
  private async getImplementationUris(location: vscode.Location): Promise<vscode.Uri[]> {
    const currentImplementations = await VSCodeApi.getImplementations(location.uri, location.range.start);
    if (currentImplementations.length > 0) {
      const currentImplementation = currentImplementations.pop()!;
      return this.getUris(currentImplementation.uri);
    }
    return [location.uri];
  }

  /**
   * Вернуть массив Uri, в которых надо искать.
   * @param uri Исходный Uri.
   * @returns Массив Uri.
   */
  private getUris(uri: vscode.Uri): vscode.Uri[] {
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

  protected async getLocationAndWrapperProgrammingConstruct(sourceLocation: vscode.Location): Promise<{
    location: vscode.Location;
    wrapperProgrammingConstruct: ResourceEntityOrReport;
  } | null> {
    const location = await this.getLastImplementLocation();
    if (location) {
      const wrapperProgrammingConstruct = await DocumentSymbolLoader.loadWrapperProgrammingConstruct(location);
      if (wrapperProgrammingConstruct instanceof ResourceEntityOrReport) {
        return { location, wrapperProgrammingConstruct };
      }
    }
    return null;
  }

  /**
   * Вернуть местоположение последней реализации.
   * @returns Местоположение последней реализации или null, если реализацию найти не удалось.
   */
  private async getLastImplementLocation(): Promise<vscode.Location | null> {
    const locations = await this.getImplements();
    if (locations.length > 0) {
      return locations.pop()!;
    }
    return null;
  }

  /**
   * Вернуть расположения реализации.
   * @returns Массив расположений реализации.
   */
  private async getImplements(): Promise<vscode.Location[]> {
    const newPosition = await this.getPositionDiff();
    const position = new vscode.Position(
      this.symbol.container.range.start.line + newPosition.lineOffset,
      newPosition.characterStart,
    );
    return await VSCodeApi.getDefinitions(this.symbol.uri, position);
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
