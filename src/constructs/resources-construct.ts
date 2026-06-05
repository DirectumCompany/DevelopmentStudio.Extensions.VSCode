/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/array-type */
/* eslint-disable import/order */
import * as vscode from 'vscode';
import fs from 'fs';
import path from 'path';
import * as VSCodeApi from '../vscode-api';
import { ElementDetail, ISourceLocation, SupportTextFormatSearch } from '../types';
import { TextFormatSearcher } from '../searchers/searcher-resources-or-queries';
import { DocumentSymbolLoader } from '../symbol-loader';
import { getOnlyName } from '../utils';

/** Класс для создания описания элемента ресурсной строки. */
export class Resources {
  /**
   * Создать объект в зависимости от его типа.
   * @param uri Uri из комментария.
   * @param symbol Описание.
   * @returns Возвращается созданный в зависимости от описания объект или null, если описание не подошло под условия создания.
   */
  public static Create(uri: vscode.Uri | null, symbol: ElementDetail): SupportTextFormatSearch | null {
    if (
      symbol.parent.name.endsWith('Resources') &&
      [vscode.SymbolKind.Method, vscode.SymbolKind.Property].includes(symbol.container.kind)
    ) {
      if (!symbol.uri.fsPath.endsWith('Module.g.cs')) return new ResourceEntityOrReport(symbol);
      if (uri) return new ResourceModuleOrSolution(uri, symbol);
    }
    return null;
  }
}

/** Интерфейс попытки получения результата. */
interface ITryGetResult {
  /** Признак успешности получения результата. */
  success: boolean;
  /** Результат. */
  result: string;
}

/** Описание элемента ресурсной строки сущности или отчета. */
class ResourceEntityOrReport implements SupportTextFormatSearch {
  /** Имя. */
  public name: string;

  /** Исходное расположение. */
  public sourceLocation: ISourceLocation | undefined;

  /**
   * Конструктор.
   * @param symbol Элемент с дополнительной информацией.
   */
  public constructor(symbol: ElementDetail) {
    const onlyName = getOnlyName(symbol.container);
    this.name = onlyName.replace(/(\w*)Format/, '$1');
  }

  public async getOriginalSymbols(): Promise<vscode.Location[]> {
    return await this.getResourceStringLocations();
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
   * Вернуть путь к ресурсному файлу из href-комментария.
   * @returns Расположение или null, если не удалось достать информацию.
   */
  protected async getResourcesPathFromComment(): Promise<string | null> {
    if (!this.sourceLocation) return null;

    const implementation = await this.getImplementation(this.sourceLocation);
    if (!implementation?.uri.fsPath.endsWith('.g.cs')) return null;

    const documentLines = await VSCodeApi.loadDocumentLines(implementation.uri);
    const commentInfo = await DocumentSymbolLoader.getInfoFromComment(documentLines, implementation.range);
    const uri = commentInfo.uri;
    return uri?.fsPath ?? null;
  }

  /**
   * Вернуть расположения ресурсной строки.
   * @returns Массив с {@link vscode.Location расположениями}.
   */
  private async getResourceStringLocations(): Promise<vscode.Location[]> {
    if (!this.sourceLocation) return [];
    const documentUris = await this.getSearchUris(this.sourceLocation.document.uri);
    const local = new TextFormatSearcher(documentUris, this);
    return await local.getSymbols();
  }

  /**
   * Вернуть массив Uri для поиска элемента.
   * @param uri Uri документа, в котором вызывана команда.
   * @returns Массив Uri для поиска элемента.
   */
  private async getSearchUris(uri: vscode.Uri): Promise<vscode.Uri[]> {
    const defaultResourcesPath = await this.getResourcesPathFromComment();
    if (defaultResourcesPath) {
      return this.getResourcesUris(defaultResourcesPath);
    }
    return [uri];
  }

  /**
   * Вернуть {@link vscode.Location расположение}.
   * @param sourceLocation Исходное расположение.
   * @returns Наиболее подходящее {@link vscode.Location расположение} или null, если такого не нашлось.
   */
  private async getImplementation(sourceLocation: ISourceLocation): Promise<vscode.Location | null> {
    const { document, position } = sourceLocation;
    const implementations = await VSCodeApi.getImplementations(document.uri, position);
    if (implementations?.length <= 0) return null;
    if (implementations?.length === 1) return implementations[0];

    const resourcesManagerPath = await this.getRepositoryPath(sourceLocation);
    if (!resourcesManagerPath.success) return implementations[0];

    const suitableImplementation = implementations.find(
      (implementation) => implementation.uri.fsPath === resourcesManagerPath.result,
    );
    if (suitableImplementation) return suitableImplementation;

    /**
     * Вернуть имя g.cs файла с объявлением ресурсов для случая, когда ресурсная строка в перекрытии не переопределена.
     * @param fullPath Полный путь.
     * @returns Имя файла.
     */
    const getFileName = (fullPath: string): string => path.parse(fullPath).base;

    /**
     * Вернуть часть пути к g.cs файлу с объявлением ресурсов для случая, когда ресурсная строка в перекрытии переопределена.
     * @param fullPath Полный путь.
     * @returns Часть пути.
     */
    const getPartPath = (fullPath: string): string => {
      const dir = path.parse(fullPath).dir;
      return dir.slice(0, dir.lastIndexOf(path.sep));
    };

    for (const func of [getFileName, getPartPath]) {
      const resourcesManagerFileName = func(resourcesManagerPath.result);
      const result = implementations.find(
        (implementation) => resourcesManagerFileName === func(implementation.uri.fsPath),
      );
      if (result) return result;
    }
    return implementations[0];
  }

  /**
   * Вернуть путь до файла, где создается класс ресурсов.
   * @param sourceLocation Исходное расположение.
   * @returns В случае успеха возвращается путь до файла, где создается класс ресурсов.
   */
  private async getRepositoryPath(sourceLocation: ISourceLocation): Promise<ITryGetResult> {
    const { document, position } = sourceLocation;

    /**
     * Вернуть индекс, где начинается соседний токен.
     * @returns Возвращает индекс, где начинается соседний токен, или -1 если диапазон текщего токена оперделить не удалось.
     */
    const getNearestTokenIndex = (): number => {
      const range = document.getWordRangeAtPosition(position);
      if (range) {
        return range.start.character - 1;
      }
      return -1;
    };

    /**
     * Вернуть расположения либо из вызова определения, либо из вызова оперделения типа, если определния ссылаются на путь из исходного Uri.
     * @param uri Uri документа, в котором вызывана команда.
     * @param newPosition Позиция, где была вызвана команда.
     * @returns Массив с {@link vscode.Location расположениями}.
     */
    const getLocationsFromDefinition = async (
      uri: vscode.Uri,
      newPosition: vscode.Position,
    ): Promise<vscode.Location[]> => {
      let locations = [];
      locations = await VSCodeApi.getDefinitions(uri, newPosition);
      // Если ссылку на ресурсы сохранили в локальную переменную, то определение будет ссылаться на этот же файл.
      // В таком случае пытаемся получить расположение определений ресурсов из определений типа.
      // Подстраховка для случаев, когда будут использовать такой код:
      //   var res = Documents.Resources;
      //   var str = res.MyTest;
      if (locations.length > 0 && locations[0].uri.fsPath === uri.fsPath) {
        locations = await VSCodeApi.getTypeDefinitions(uri, newPosition);
      }
      return locations;
    };

    const index = getNearestTokenIndex();
    if (index > -1) {
      const newPosition = new vscode.Position(position.line, index);
      const resourcesManagerLocations = await getLocationsFromDefinition(document.uri, newPosition);
      if (resourcesManagerLocations.length > 0) {
        return { success: true, result: resourcesManagerLocations[0].uri.fsPath };
      }
    }
    return { success: false, result: '' };
  }

  /**
   * Вернуть массив Uri ресурсных файлов.
   * @param sourcePathUri Исходное расположение.
   * @returns Массив Uri ресурсных файлов.
   */
  private async getResourcesUris(sourcePathUri: string): Promise<vscode.Uri[]> {
    const RESOURCES_EXTENSION = '.resx';
    const uris: vscode.Uri[] = [];
    const resourcesLanguageDefault = vscode.workspace
      .getConfiguration()
      .get<string>('sungero.resourseLanguageDefault')!;
    const settingExtensionPairs = [
      { setting: 'en', extension: `${RESOURCES_EXTENSION}` },
      { setting: 'ru', extension: `.ru${RESOURCES_EXTENSION}` },
    ];
    settingExtensionPairs.sort((first) => (first.setting === resourcesLanguageDefault ? -1 : 1));

    const pathWithoutExtension = sourcePathUri.substring(0, sourcePathUri.length - RESOURCES_EXTENSION.length);
    const resourceFilePaths: string[] = settingExtensionPairs.map((item) => pathWithoutExtension + item.extension);
    for (const filePath of resourceFilePaths) {
      if (fs.existsSync(filePath)) {
        uris.push(vscode.Uri.file(filePath));
      }
    }
    return uris;
  }
}

/** Описание элемента ресурсной строки модуля или решения. */
class ResourceModuleOrSolution extends ResourceEntityOrReport {
  /** Uri из комментария. */
  private uri: vscode.Uri;

  /**
   * Конструктор.
   * @param uri Uri из комментария.
   * @param symbol Элемент с дополнительной информацией.
   */
  public constructor(uri: vscode.Uri, symbol: ElementDetail) {
    super(symbol);
    this.uri = uri;
  }

  protected async getResourcesPathFromComment(): Promise<string> {
    return this.uri.fsPath;
  }
}
