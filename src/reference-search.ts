/* eslint-disable @typescript-eslint/array-type */
import * as vscode from 'vscode';
import { DocumentSymbolLoader } from './symbol-loader';
import { isWrapperFile } from './utils';
import * as VSCodeApi from './vscode-api';
import { WrapperLocator } from './wrapper-locator';

/** Запись кэша найденных ссылок. */
interface IReferenceCacheEntry {
  /** Найденные ссылки. */
  locations: vscode.Location[];
  /** Момент вычисления ссылок (мс). */
  computedAt: number;
}

/** Поиск мест использования функции, структуры или константы (оригинал + сгенерированные обёртки). */
export class ReferenceSearch {
  /** Кэш ссылок по ключу запроса. */
  private static readonly referenceCache = new Map<string, IReferenceCacheEntry>();

  /** Время жизни кэша ссылок (мс). */
  private static readonly cacheLifetimeMs = 15000;

  /** Сбросить кэш ссылок. */
  public static clearCache(): void {
    ReferenceSearch.referenceCache.clear();
  }

  /**
   * Ключ позиции для кэша.
   * @param location Позиция или undefined.
   * @returns Строковый ключ.
   */
  private static locationCacheKey(location?: vscode.Location): string {
    if (!location) return '';
    return `${location.uri.toString()}|${location.range.start.line}:${location.range.start.character}`;
  }

  /**
   * Ссылки по сгенерированным обёрткам символа.
   * @description Находит обёртки в `*.g.cs` и запрашивает ссылки Roslyn по каждой из них.
   * @param originalUri Uri файла-оригинала.
   * @param searchNames Имена обёрток для поиска.
   * @param parentNames Имена содержащего типа (для членов структур и констант).
   * @param includeGeneratedFiles Не отбрасывать результаты в `*.g.cs` (нужно структурам: ссылки интерфейса
   * лежат в сгенерированных файлах).
   * @param originalLocation Позиция символа под курсором (для различия перегрузок).
   * @param token Токен отмены.
   * @returns Места использования в прикладном коде.
   */
  public static findReferencesThroughWrappers(
    originalUri: vscode.Uri,
    searchNames: string[],
    parentNames: string[],
    includeGeneratedFiles = false,
    originalLocation?: vscode.Location,
    token?: vscode.CancellationToken,
  ): Promise<vscode.Location[]> {
    const key = `w|${originalUri.toString()}|${searchNames.join(',')}|${parentNames.join(',')}|${includeGeneratedFiles}|${ReferenceSearch.locationCacheKey(originalLocation)}`;
    return ReferenceSearch.getCachedOrCompute(key, async () => {
      const wrappers = await WrapperLocator.findWrapperLocations(
        originalUri,
        searchNames,
        parentNames,
        originalLocation,
        token,
      );
      if (token?.isCancellationRequested) return [];

      // Запросы к Roslyn идут параллельно.
      const referencesPerWrapper = await Promise.all(
        wrappers.map((wrapper) => VSCodeApi.getReferencesAt(wrapper.uri, wrapper.range.start)),
      );
      if (token?.isCancellationRequested) return [];

      const locations = referencesPerWrapper.flatMap((references) =>
        (references ?? []).filter((loc) => includeGeneratedFiles || !isWrapperFile(loc.uri)),
      );
      return ReferenceSearch.deduplicateLocations(locations);
    });
  }

  /**
   * Объявления обёрток в `*.g.cs`, которые ведут на файл-оригинал (результат кэшируется).
   * @description Строку обёртки добавляет вызывающий и только для тех символов, для которых Roslyn её не
   * возвращает сам (свойства, поля, константы). Для функций обёртка вызывает оригинал, поэтому ссылку в
   * `*.g.cs` отдаёт штатный провайдер, и вызывающий этот метод не использует.
   * @param uri Uri файла-оригинала.
   * @param searchNames Имена обёрток для поиска.
   * @param parentNames Имена содержащего типа (для членов).
   * @param originalLocation Позиция символа под курсором (для различия перегрузок).
   * @param token Токен отмены.
   * @returns Позиции обёрток.
   */
  public static findWrapperDeclarationLocations(
    uri: vscode.Uri,
    searchNames: string[],
    parentNames: string[],
    originalLocation?: vscode.Location,
    token?: vscode.CancellationToken,
  ): Promise<vscode.Location[]> {
    const key = `d|${uri.toString()}|${searchNames.join(',')}|${parentNames.join(',')}|${ReferenceSearch.locationCacheKey(originalLocation)}`;
    return ReferenceSearch.getCachedOrCompute(key, () =>
      WrapperLocator.findWrapperLocations(uri, searchNames, parentNames, originalLocation, token),
    );
  }

  /**
   * Найти связанные ссылки символа из места использования.
   * @description В месте вызова под курсором нет объявления. От найденного оригинала добавляются и ссылки
   * оригинала, и ссылки обёрток, поэтому список совпадает с вызовом из определения.
   * @param uri Uri документа, в котором вызвана команда.
   * @param position Позиция, в которой вызвана команда.
   * @param token Токен отмены.
   * @returns Места использования.
   */
  public static findReferencesFromUsage(
    uri: vscode.Uri,
    position: vscode.Position,
    token?: vscode.CancellationToken,
  ): Promise<vscode.Location[]> {
    const key = `c|${uri.toString()}|${position.line}:${position.character}`;
    return ReferenceSearch.getCachedOrCompute(key, async () => {
      const definitions = (await VSCodeApi.getDefinitions(uri, position)) ?? [];
      let originals = definitions.filter((definition) => !isWrapperFile(definition.uri));

      // Если оригинал не пришёл напрямую — достаём его от обёртки по href.
      if (originals.length === 0) {
        const foundOriginals: Array<vscode.Location> = [];
        for (const wrapper of definitions.filter((definition) => isWrapperFile(definition.uri))) {
          const construct = await DocumentSymbolLoader.loadWrapperProgrammingConstruct(wrapper);
          if (construct) foundOriginals.push(...(await construct.getOriginalSymbols()));
        }
        originals = foundOriginals;
      }

      // Независимо от точки вызова считаем ссылки обёрток от оригинала.
      const locations: Array<vscode.Location> = [];
      for (const original of originals) {
        if (token?.isCancellationRequested) return [];

        const document = await vscode.workspace.openTextDocument(original.uri);
        const symbolAtPosition = await WrapperLocator.findSymbolAtPosition(document, original.range.start);
        if (!symbolAtPosition) continue;

        const searchNames = WrapperLocator.getWrapperNameVariants(symbolAtPosition.symbol);
        const parentNames = WrapperLocator.getContainerTypeNameVariants(
          symbolAtPosition.symbol,
          symbolAtPosition.containerTypeName,
        );
        const originalLocation = new vscode.Location(original.uri, symbolAtPosition.symbol.selectionRange);
        const includeGeneratedFiles = WrapperLocator.isTypeSymbolKind(symbolAtPosition.symbol.kind);
        const originalReferences = ((await VSCodeApi.getReferencesAt(original.uri, original.range.start)) ?? []).filter(
          (loc) => !isWrapperFile(loc.uri),
        );
        locations.push(...originalReferences);
        locations.push(
          ...(await ReferenceSearch.findReferencesThroughWrappers(
            original.uri,
            searchNames,
            parentNames,
            includeGeneratedFiles,
            originalLocation,
            token,
          )),
        );
        if (!includeGeneratedFiles && symbolAtPosition.symbol.kind !== vscode.SymbolKind.Method) {
          locations.push(
            ...(await ReferenceSearch.findWrapperDeclarationLocations(
              original.uri,
              searchNames,
              parentNames,
              originalLocation,
              token,
            )),
          );
        }
      }
      return ReferenceSearch.deduplicateLocations(locations);
    });
  }

  /**
   * Вернуть результат из кэша либо вычислить и закэшировать его.
   * @param key Ключ.
   * @param compute Вычисление ссылок.
   * @returns Ссылки.
   */
  private static async getCachedOrCompute(
    key: string,
    compute: () => Promise<vscode.Location[]>,
  ): Promise<vscode.Location[]> {
    const entry = ReferenceSearch.referenceCache.get(key);
    if (entry && Date.now() - entry.computedAt <= ReferenceSearch.cacheLifetimeMs) return entry.locations;

    const locations = await compute();
    if (locations.length > 0) ReferenceSearch.referenceCache.set(key, { locations, computedAt: Date.now() });
    return locations;
  }

  /**
   * Убрать дубликаты ссылок.
   * @param locations Ссылки.
   * @returns Уникальные ссылки.
   */
  public static deduplicateLocations(locations: vscode.Location[]): vscode.Location[] {
    const seen = new Set<string>();
    return locations.filter((location) => {
      const key = ReferenceSearch.locationCacheKey(location);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
