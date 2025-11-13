import * as vscode from 'vscode';
import fs from 'fs';
import * as VSCodeApi from '../vscode-api';
import { ElementDetail, IGetOriginalSymbols } from '../types';
import { SymbolSearcherResources } from '../searchers/symbol-searcher-resources';
import { DocumentSymbolLoader } from '../symbol-loader';

export class Resources {
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

  public constructor(symbol: ElementDetail) {
    this.name = symbol.container.name.replace(/(\w*)Format/, '$1');
  }

  public async getOriginalSymbols(sourceLocation: vscode.Location): Promise<vscode.Location[]> {
    return await this.getOriginalSymbolResourceString(sourceLocation);
  }

  /**
   * Вернуть массив uri, в которых надо искать.
   * @param uri Исходный uri.
   * @returns Массив uri.
   */
  public getUris(uri: vscode.Uri): vscode.Uri[] {
    const uris: vscode.Uri[] = [];
    const resourcesLanguageDefault = vscode.workspace.getConfiguration().get<string>('sungero.resourseLanguageDefault');
    const filePaths: string[] =
      resourcesLanguageDefault == 'en'
        ? [uri.fsPath.replace('g.cs', 'resx'), uri.fsPath.replace('g.cs', 'ru.resx')]
        : [uri.fsPath.replace('g.cs', 'ru.resx'), uri.fsPath.replace('g.cs', 'resx')];
    for (const filePath of filePaths) {
      if (fs.existsSync(filePath)) {
        uris.push(vscode.Uri.file(filePath));
      }
    }
    return uris;
  }

  /**
   * Проверить, что переданная строка содержит имя искомой ресурсной строки.
   * @param line Строка, в которой будет проводиться поиск.
   * @returns true - если строка содержит ресрную строку, иначе false.
   */
  public isEqual(line: string): boolean {
    return line.trim().startsWith(`<data name="${this.name}"`);
  }

  /**
   * Вернуть {@link vscode.Location расположение} и описание элемента.
   * @param sourceLocation Исходное расположение.
   * @returns Расположение и описание элемента или null.
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
      originalSymbols = await this.getResourceString(data.location, data.wrapperProgrammingConstruct);
    }
    return Promise.resolve(originalSymbols);
  }

  /**
   * Вернуть расположения ресурсной строки.
   * @param location Исходное {@link vscode.Location местоположение}.
   * @param wrapperDescription {@link ProgrammingConstruct Определение} из обертки, на основе которого ищем описание.
   * @returns Массив с {@link vscode.Location расположениями}.
   */
  private async getResourceString(
    location: vscode.Location,
    wrapperDescription: ResourceEntityOrReport,
  ): Promise<vscode.Location[]> {
    const result = [];
    const documentUri = await this.getUriFromImplementation(location);
    const local = new SymbolSearcherResources(documentUri, wrapperDescription);
    const symbols = await local.getSymbols();
    result.push(...symbols);
    return Promise.resolve(result);
  }

  /**
   * Вернуть Uri файлов, где расположена реализация элемента.
   * @param location Исходное расположение элемента.
   * @returns Uri файлов, где расположена реализация.
   */
  private async getUriFromImplementation(location: vscode.Location): Promise<vscode.Uri> {
    const currentImplementations = await VSCodeApi.getImplementations(location.uri, location.range.start);
    if (currentImplementations.length > 0) {
      const currentImplementation = currentImplementations.pop()!;
      return currentImplementation.uri;
    }
    return location.uri;
  }
}

/** Описание элемента ресурсной строки модуля или решения. */
class ResourceModuleOrSolution extends ResourceEntityOrReport {
  /** Детальное описание элемента. */
  protected symbol: ElementDetail;

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
      if (wrapperProgrammingConstruct && wrapperProgrammingConstruct instanceof ResourceEntityOrReport) {
        return { location, wrapperProgrammingConstruct };
      }
    }
    return null;
  }

  /**
   * Вернуть местоположение последней реализации.
   * @returns Местоположение последней реализации или null.
   */
  private async getLastImplementLocation(): Promise<vscode.Location | null> {
    const locations = await this.getImplement();
    if (locations.length > 0) {
      return locations.pop()!;
    }
    return null;
  }

  /**
   * Вернуть расположения реализации.
   * @returns Массив расположений реализации.
   */
  private async getImplement(): Promise<vscode.Location[]> {
    const newPosition = await this.getPostitonDiff();
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
  private async getPostitonDiff(): Promise<{ lineOffset: number; characterStart: number }> {
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
