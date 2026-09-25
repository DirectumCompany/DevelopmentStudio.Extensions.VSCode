/* eslint-disable @typescript-eslint/array-type */
import * as vscode from 'vscode';
import { DocumentSymbolLoader } from './symbol-loader';
import { isWrapperFile } from './utils';
import * as VSCodeApi from './vscode-api';

/** Символ в файле-оригинале и имя его содержащего символа. */
export interface ISymbolAtPosition {
  /** Символ под курсором. */
  symbol: vscode.DocumentSymbol;
  /** Имя типа-контейнера символа в файле-оригинале. */
  containerTypeName: string;
}

/** Обёртки, найденные в одном сгенерированном файле. */
interface IWrappersInFile {
  /** Uri файла с обёртками. */
  fileUri: vscode.Uri;
  /** Диапазоны символов-обёрток. */
  symbolRanges: vscode.Range[];
}

/** Поиск сгенерированных обёрток функций, структур и констант в `*.g.cs`. */
export class WrapperLocator {
  /** Виды символов-типов (структуры). */
  private static readonly typeSymbolKinds = [
    vscode.SymbolKind.Class,
    vscode.SymbolKind.Struct,
    vscode.SymbolKind.Interface,
  ];

  /** Виды символов-членов, имя которых может повторяться в разных типах. */
  private static readonly memberSymbolKinds = [
    vscode.SymbolKind.Property,
    vscode.SymbolKind.Field,
    vscode.SymbolKind.Constant,
  ];

  /** Регулярное выражение объявления типа в сгенерированном файле. */
  private static readonly typeDeclarationPattern =
    /^\s*(?:\[[^\]]*\]\s*)*(?:(?:public|internal|private|protected|static|sealed|abstract|partial|readonly|unsafe|new)\s+)*(?:class|interface|struct)\s+([A-Za-z_]\w*)/;

  /**
   * Нормализовать путь для сравнения: убрать префикс file:///, привести разделители и регистр.
   * @param value Путь или href.
   * @returns Нормализованный путь.
   */
  public static normalizeFilePath(value: string): string {
    return value
      .replace(/^file:\/\/\//, '')
      .replace(/^\/([a-zA-Z]:)/, '$1')
      .replace(/\//g, '\\')
      .toLowerCase();
  }

  /**
   * Вернуть имя символа без сигнатуры и возвращаемого типа.
   * @param name Имя символа.
   * @returns Короткое имя.
   */
  public static getSymbolShortName(name: string): string {
    return name.split(/[(:]/)[0].trim();
  }

  /**
   * Варианты имени обёртки.
   * @param symbol Символ в файле-оригинале.
   * @returns Имя символа и его вариант с/без префикса `I` (для структур).
   */
  public static getWrapperNameVariants(symbol: vscode.DocumentSymbol): string[] {
    const name = WrapperLocator.getSymbolShortName(symbol.name);
    if (!WrapperLocator.typeSymbolKinds.includes(symbol.kind)) return [name];

    const alternative = name.startsWith('I') ? name.substring(1) : `I${name}`;
    return alternative.length > 0 ? [name, alternative] : [name];
  }

  /**
   * Варианты имени типа-контейнера обёртки.
   * @description Нужны, чтобы не спутать одноимённые члены разных структур в одном файле.
   * @param symbol Символ в файле-оригинале.
   * @param containerTypeName Имя содержащего символа в файле-оригинале.
   * @returns Варианты имени типа или пустой массив (для типов и функций проверка не нужна).
   */
  public static getContainerTypeNameVariants(symbol: vscode.DocumentSymbol, containerTypeName: string): string[] {
    if (!containerTypeName || !WrapperLocator.memberSymbolKinds.includes(symbol.kind)) return [];
    return containerTypeName.startsWith('I')
      ? [containerTypeName, containerTypeName.substring(1)]
      : [containerTypeName, `I${containerTypeName}`];
  }

  /**
   * Найти обёртки в `*.g.cs`, чей href-комментарий ведёт на файл-оригинал.
   * @description Кандидаты ищутся через workspace symbol search (Roslyn сам индексирует символы),
   * поэтому полный обход всех `*.g.cs` не нужен: href проверяется только у найденных файлов.
   * @param originalUri Uri файла-оригинала.
   * @param searchNames Имена для поиска.
   * @param parentNames Имена содержащего типа (для членов структур и констант).
   * @param originalLocation Позиция символа под курсором: если задана, остаются только обёртки, которые
   * ведут именно к нему (нужно для перегрузок).
   * @param token Токен отмены.
   * @returns Позиции обёрток.
   */
  public static async findWrapperLocations(
    originalUri: vscode.Uri,
    searchNames: string[],
    parentNames: string[],
    originalLocation?: vscode.Location,
    token?: vscode.CancellationToken,
  ): Promise<vscode.Location[]> {
    if (token?.isCancellationRequested) return [];

    const originalPath = WrapperLocator.normalizeFilePath(originalUri.fsPath);
    const symbols = (await Promise.all(searchNames.map((name) => VSCodeApi.findWorkspaceSymbols(name)))).flatMap(
      (result) => result ?? [],
    );
    if (token?.isCancellationRequested) return [];

    const candidates = symbols.filter(
      (symbol) =>
        isWrapperFile(symbol.location.uri) &&
        searchNames.some((name) => WrapperLocator.isWrapperNameMatch(symbol.name, name)),
    );

    const byFile = new Map<string, IWrappersInFile>();
    const seen = new Set<string>();
    for (const { location } of candidates) {
      const key = `${location.uri.toString()}|${location.range.start.line}:${location.range.start.character}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = byFile.get(location.uri.toString()) ?? { fileUri: location.uri, symbolRanges: [] };
      entry.symbolRanges.push(location.range);
      byFile.set(location.uri.toString(), entry);
    }

    const perFile = await Promise.all(
      [...byFile.values()].map(async ({ fileUri, symbolRanges }) => {
        if (token?.isCancellationRequested) return [];

        const documentLines = await VSCodeApi.loadDocumentLines(fileUri);
        const locations = symbolRanges
          .filter((range) => WrapperLocator.hasOriginalHrefNear(documentLines, range, originalPath))
          .filter((range) => WrapperLocator.hasExpectedContainerType(documentLines, range, parentNames))
          .map((range) => new vscode.Location(fileUri, range));
        return originalLocation ? WrapperLocator.filterWrappersByOriginal(locations, originalLocation) : locations;
      }),
    );
    return perFile.flat();
  }

  /**
   * Оставить только обёртки, которые ведут к указанному оригиналу.
   * @description Нужно для перегрузок: обёртки матчатся по имени, а различает их по сигнатуре сопоставление
   * из перехода по определению.
   * @param locations Позиции обёрток в `*.g.cs`.
   * @param original Позиция оригинала под курсором.
   * @returns Позиции обёрток, ведущих к этому оригиналу.
   */
  private static async filterWrappersByOriginal(
    locations: vscode.Location[],
    original: vscode.Location,
  ): Promise<vscode.Location[]> {
    const result: vscode.Location[] = [];
    for (const location of locations) {
      const construct = await DocumentSymbolLoader.loadWrapperProgrammingConstruct(location);
      if (!construct) continue;

      const originals = await construct.getOriginalSymbols();
      if (originals.some((found) => WrapperLocator.isSameLocation(found, original))) result.push(location);
    }
    return result;
  }

  /**
   * Совпадают ли uri и диапазон двух позиций.
   * @param left Первая позиция.
   * @param right Вторая позиция.
   * @returns true - если uri и диапазон совпадают.
   */
  private static isSameLocation(left: vscode.Location, right: vscode.Location): boolean {
    return left.uri.toString() === right.uri.toString() && left.range.isEqual(right.range);
  }

  /**
   * Собрать объявления документа, для которых имеет смысл искать ссылки.
   * @param uri Uri документа.
   * @returns Символы-объявления.
   */
  public static async findReferenceableDeclarations(uri: vscode.Uri): Promise<vscode.DocumentSymbol[]> {
    const topLevelSymbols = await VSCodeApi.getSymbols(uri);
    const result: vscode.DocumentSymbol[] = [];

    const walk = (symbols: vscode.DocumentSymbol[]): void => {
      for (const symbol of symbols) {
        if (WrapperLocator.isReferenceableSymbolKind(symbol.kind)) result.push(symbol);
        walk(symbol.children ?? []);
      }
    };
    walk(topLevelSymbols ?? []);
    return result;
  }

  /**
   * Найти символ-объявление под курсором.
   * @description Возвращает самый глубокий подходящий символ, чтобы метод не перекрывался классом или
   * пространством имён.
   * @param document Документ.
   * @param position Позиция под курсором.
   * @returns Символ и имя его типа-контейнера или null.
   */
  public static async findSymbolAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<ISymbolAtPosition | null> {
    const topLevelSymbols = await VSCodeApi.getSymbols(document.uri);
    if (!topLevelSymbols) return null;

    const find = (symbols: vscode.DocumentSymbol[], containerTypeName: string): ISymbolAtPosition | null => {
      for (const symbol of symbols) {
        const child = find(symbol.children ?? [], symbol.name);
        if (child) return child;
        if (WrapperLocator.isReferenceableSymbolKind(symbol.kind) && symbol.selectionRange.contains(position)) {
          return { symbol, containerTypeName };
        }
      }
      return null;
    };
    return find(topLevelSymbols, '');
  }

  /**
   * Есть ли рядом с обёрткой href-комментарий на файл-оригинал.
   * @description У типов href стоит над объявлением, а у сгенерированного класса константы - над его
   * первым членом, поэтому при отсутствии комментария сверху проверяются ближайшие строки снизу.
   * @param documentLines Строки g.cs-документа.
   * @param range Диапазон символа-обёртки.
   * @param originalPath Нормализованный путь файла-оригинала.
   * @returns true - если рядом есть href на файл-оригинал.
   */
  private static hasOriginalHrefNear(documentLines: string[], range: vscode.Range, originalPath: string): boolean {
    const href = WrapperLocator.findOriginalHrefNear(documentLines, range);
    return !!href && WrapperLocator.normalizeFilePath(href) === originalPath;
  }

  /**
   * Найти href-комментарий рядом с указанным диапазоном.
   * @param documentLines Строки документа.
   * @param range Диапазон символа.
   * @returns Путь из href или undefined.
   */
  private static findOriginalHrefNear(documentLines: string[], range: vscode.Range): string | undefined {
    return (
      WrapperLocator.findOriginalHrefAbove(documentLines, range.start.line - 1) ??
      WrapperLocator.findOriginalHrefBelow(documentLines, range.start.line + 1)
    );
  }

  /**
   * Найти href-комментарий выше указанной строки.
   * @param documentLines Строки документа.
   * @param from Строка, с которой начинается поиск вверх.
   * @returns Путь из href или undefined.
   */
  private static findOriginalHrefAbove(documentLines: string[], from: number): string | undefined {
    for (let line = from; line >= Math.max(0, from - 9); line--) {
      const match = /<see href="file:\/\/\/([^"]*)"/.exec(documentLines[line]);
      if (match) return match[1];
    }
    return undefined;
  }

  /**
   * Найти href-комментарий ниже указанной строки.
   * @param documentLines Строки документа.
   * @param from Строка, с которой начинается поиск вниз.
   * @returns Путь из href или undefined.
   */
  private static findOriginalHrefBelow(documentLines: string[], from: number): string | undefined {
    for (let line = from; line <= Math.min(documentLines.length - 1, from + 8); line++) {
      const match = /<see href="file:\/\/\/([^"]*)"/.exec(documentLines[line]);
      if (match) return match[1];
    }
    return undefined;
  }

  /**
   * Относится ли обёртка к ожидаемому типу-контейнеру.
   * @param documentLines Строки g.cs-документа.
   * @param range Диапазон символа-обёртки.
   * @param parentNames Ожидаемые имена типа; пустой массив - проверка не нужна.
   * @returns true - если тип обёртки определить не удалось или он совпадает с ожидаемым.
   */
  private static hasExpectedContainerType(
    documentLines: string[],
    range: vscode.Range,
    parentNames: string[],
  ): boolean {
    if (parentNames.length === 0) return true;
    const container = WrapperLocator.getEnclosingTypeName(documentLines, range.start.line);
    return !container || parentNames.includes(container);
  }

  /**
   * Найти имя ближайшего объявления типа выше указанной строки.
   * @param documentLines Строки документа.
   * @param line Строка обёртки.
   * @returns Имя типа или undefined.
   */
  private static getEnclosingTypeName(documentLines: string[], line: number): string | undefined {
    for (let i = line - 1; i >= 0; i--) {
      const match = WrapperLocator.typeDeclarationPattern.exec(documentLines[i]);
      if (match) return match[1];
    }
    return undefined;
  }

  /**
   * Совпадает ли имя символа-обёртки с искомым.
   * @description Допускает квалификацию (`Тип.Метод`) и сигнатуру, но не префиксное совпадение.
   * @param candidate Имя символа из workspace symbol search.
   * @param search Искомое имя.
   * @returns true - если имена совпадают.
   */
  private static isWrapperNameMatch(candidate: string, search: string): boolean {
    const name = WrapperLocator.getSymbolShortName(candidate);
    const index = name.lastIndexOf(search);
    if (index < 0) return false;

    const before = index === 0 ? '' : name[index - 1];
    const after = index + search.length < name.length ? name[index + search.length] : '';
    return !WrapperLocator.isIdentifierChar(before) && !WrapperLocator.isIdentifierChar(after);
  }

  /**
   * Является ли символ частью идентификатора.
   * @param char Проверяемый символ.
   * @returns true- если символ буква, цифра или `_`.
   */
  private static isIdentifierChar(char: string): boolean {
    return /[A-Za-z0-9_]/.test(char);
  }

  /**
   * Относится ли вид символа к типам (структуры).
   * @param kind Вид символа.
   * @returns true - если это класс, структура или интерфейс.
   */
  public static isTypeSymbolKind(kind: vscode.SymbolKind): boolean {
    return WrapperLocator.typeSymbolKinds.includes(kind);
  }

  /**
   * Вид символа, для которого существует обёртка и можно искать ссылки.
   * @param kind Вид символа.
   * @returns true - если вид поддерживается.
   */
  private static isReferenceableSymbolKind(kind: vscode.SymbolKind): boolean {
    return (
      WrapperLocator.typeSymbolKinds.includes(kind) ||
      WrapperLocator.memberSymbolKinds.includes(kind) ||
      kind === vscode.SymbolKind.Method
    );
  }
}
