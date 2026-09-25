import * as vscode from 'vscode';
import { ReferenceSearch } from './reference-search';
import { isWrapperFile } from './utils';
import { WrapperLocator } from './wrapper-locator';

/**
 * Дополнительный поставщик ссылок (Find All References) для функций, структур и констант модуля.
 * @description Roslyn не связывает «оригинальный» символ (метод, класс/интерфейс структуры, константу
 * в прикладном коде) с его сгенерированной обёрткой в `*.g.cs` — это разные символы. Поэтому
 * Find All References, вызванный из оригинала, пропускает места использования через обёртку.
 *
 * Провайдер работает в обратную сторону: если символ под курсором — в «оригинальном» файле
 * (не `*.g.cs`), он ищет обёртки в `*.g.cs`, у которых href-комментарий указывает на файл-оригинал,
 * и возвращает результаты Roslyn-поиска по ним — реальные места использования.
 */
export class AdditionalReferenceProvider implements vscode.ReferenceProvider {
  /**
   * Предоставить ссылки на символ.
   * @param document Документ, в котором вызвана команда.
   * @param position Позиция, в которой вызвана команда.
   * @param context Контекст запроса (в т.ч. нужно ли включать объявление).
   * @param token Токен отмены.
   * @returns Массив {@link vscode.Location расположений} или null.
   */
  public async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
    token: vscode.CancellationToken,
  ): Promise<Array<vscode.Location> | null> {
    // Из g.cs ссылки не ищем: там работает штатный C#-провайдер.
    if (isWrapperFile(document.uri) || token.isCancellationRequested) {
      return null;
    }

    const symbolAtPosition = await WrapperLocator.findSymbolAtPosition(document, position);
    if (token.isCancellationRequested) return null;

    let locations: Array<vscode.Location>;

    if (symbolAtPosition) {
      const searchNames = WrapperLocator.getWrapperNameVariants(symbolAtPosition.symbol);
      const parentNames = WrapperLocator.getContainerTypeNameVariants(
        symbolAtPosition.symbol,
        symbolAtPosition.containerTypeName,
      );
      const includeGeneratedFiles = WrapperLocator.isTypeSymbolKind(symbolAtPosition.symbol.kind);

      // Для методов позиция нужна, чтобы различать перегрузки.
      const originalLocation =
        symbolAtPosition.symbol.kind === vscode.SymbolKind.Method
          ? new vscode.Location(document.uri, symbolAtPosition.symbol.selectionRange)
          : undefined;

      const wrapperReferences = await ReferenceSearch.findReferencesThroughWrappers(
        document.uri,
        searchNames,
        parentNames,
        includeGeneratedFiles,
        originalLocation,
        token,
      );
      if (token.isCancellationRequested) return null;

      if (includeGeneratedFiles) {
        locations = wrapperReferences;
      } else {
        // Места вызова через обёртки. Строку обёртки в g.cs добавляем только там, где штатный
        // провайдер её не отдаёт сам (не функции): иначе она уже есть в ссылках Roslyn.
        locations = [...wrapperReferences];
        if (symbolAtPosition.symbol.kind !== vscode.SymbolKind.Method) {
          const wrapperDeclarations = await ReferenceSearch.findWrapperDeclarationLocations(
            document.uri,
            searchNames,
            parentNames,
            originalLocation,
            token,
          );
          locations.push(...wrapperDeclarations);
        }
      }
    } else {
      // Из места использования добавляем ссылки второй стороны.
      locations = await ReferenceSearch.findReferencesFromUsage(document.uri, position, token);
    }

    if (token.isCancellationRequested) return null;
    return locations.length > 0 ? locations : null;
  }
}
