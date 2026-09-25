import * as vscode from 'vscode';
import { ReferenceSearch } from './reference-search';
import { isWrapperFile } from './utils';
import * as VSCodeApi from './vscode-api';
import { WrapperLocator } from './wrapper-locator';

/** Объявление, к которому привязана линза. */
interface IDeclarationCodeLens {
  /** Uri документа с объявлением. */
  documentUri: vscode.Uri;
  /** Позиция объявления. */
  position: vscode.Position;
}

/** Линза с прикреплёнными данными объявления. */
interface ICodeLensData extends vscode.CodeLens {
  /** Данные объявления. */
  declaration?: IDeclarationCodeLens;
}

/** Запись кэша: объявление и найденные для него ссылки. */
interface ICodeLensCacheEntry {
  /** Данные объявления. */
  declaration: IDeclarationCodeLens;
  /** Найденные ссылки. */
  references: Array<vscode.Location>;
}

/**
 * Дополнительный поставщик CodeLens «N references».
 * @description Штатная линза C#-расширения считает только прямые ссылки Roslyn и не учитывает места
 * использования через обёртки. Линза считает объединённые ссылки, но с задержкой и обновляет число
 * только когда набор ссылок реально изменился.
 */
export class AdditionalCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  /** Эмиттер изменения списка линз. */
  private readonly lensesChanged = new vscode.EventEmitter<void>();

  /** Задержка первого расчёта числа ссылок (мс). */
  private static readonly firstCountDelayMs = 1500;

  /** Период перепроверки ссылок видимых документов (мс). */
  private static readonly refreshIntervalMs = 15000;

  /** Кэш ссылок: ключ (uri + позиция) -> объявление и ссылки. */
  private readonly referenceCounts = new Map<string, ICodeLensCacheEntry>();

  /** Отложенные расчёты: ключ объявления -> таймер. */
  private readonly pendingCounts = new Map<string, NodeJS.Timeout>();

  /** Таймер периодической перепроверки видимых документов. */
  private readonly refreshTimer = setInterval(
    () => void this.refreshVisibleDocuments(),
    AdditionalCodeLensProvider.refreshIntervalMs,
  );

  /** Признак, что пересчёт уже идёт (защита от наложения). */
  private isRecomputing = false;

  /** Признак, что во время пересчёта запросили ещё один (нужно повторить). */
  private isRecomputeQueued = false;

  /** Событие изменения списка линз. */
  public readonly onDidChangeCodeLenses = this.lensesChanged.event;

  /**
   * Конструктор.
   * @param logger Логгер расширения.
   */
  constructor(private readonly logger: vscode.LogOutputChannel) {}

  /**
   * Пересчитать ссылки и уведомить, если они изменились.
   * @param documentUri Ограничить пересчёт одним документом.
   */
  public refreshReferences(documentUri?: vscode.Uri): void {
    void this.recomputeReferences(documentUri);
  }

  /**
   * Забыть ссылки и отложенные расчёты документа.
   * @param uri Uri документа.
   */
  public clearDocumentReferences(uri: vscode.Uri): void {
    const prefix = `${uri.toString()}|`;
    for (const [key, timer] of this.pendingCounts) {
      if (!key.startsWith(prefix)) continue;
      clearTimeout(timer);
      this.pendingCounts.delete(key);
    }
    for (const key of this.referenceCounts.keys()) {
      if (key.startsWith(prefix)) this.referenceCounts.delete(key);
    }
  }

  /** Освободить ресурсы. */
  public dispose(): void {
    clearInterval(this.refreshTimer);
    for (const timer of this.pendingCounts.values()) clearTimeout(timer);
    this.pendingCounts.clear();
    this.lensesChanged.dispose();
  }

  /**
   * Вернуть линзы для объявлений документа.
   * @param document Документ.
   * @returns Массив {@link vscode.CodeLens линз}.
   */
  public async provideCodeLenses(document: vscode.TextDocument): Promise<Array<vscode.CodeLens>> {
    if (isWrapperFile(document.uri)) return [];

    const declarations = await WrapperLocator.findReferenceableDeclarations(document.uri);
    return declarations.map((symbol) => {
      const codeLens = new vscode.CodeLens(symbol.selectionRange) as ICodeLensData;
      codeLens.declaration = { documentUri: document.uri, position: symbol.selectionRange.start };
      return codeLens;
    });
  }

  /**
   * Разрешить линзу: показать закэшированное число либо запланировать отложенный расчёт.
   * @param codeLens Линза.
   * @returns Линза с командой показа списка.
   */
  public resolveCodeLens(codeLens: vscode.CodeLens): vscode.CodeLens {
    const declaration = (codeLens as ICodeLensData).declaration;
    if (!declaration) return codeLens;

    const entry = this.referenceCounts.get(AdditionalCodeLensProvider.declarationCacheKey(declaration));
    if (!entry) {
      this.scheduleCount(declaration);
      return codeLens;
    }

    codeLens.command = {
      title: entry.references.length === 1 ? '1 reference' : `${entry.references.length} references`,
      command: 'editor.action.showReferences',
      arguments: [declaration.documentUri, declaration.position, entry.references],
    };
    return codeLens;
  }

  /**
   * Запланировать отложенный расчёт числа ссылок.
   * @param declaration Данные объявления.
   */
  private scheduleCount(declaration: IDeclarationCodeLens): void {
    const key = AdditionalCodeLensProvider.declarationCacheKey(declaration);
    if (this.pendingCounts.has(key)) return;

    const timer = setTimeout(() => {
      this.pendingCounts.delete(key);
      void this.countReferences(declaration).then((locations) => {
        if (locations.length === 0) return;
        this.referenceCounts.set(key, { declaration, references: locations });
        this.lensesChanged.fire();
      });
    }, AdditionalCodeLensProvider.firstCountDelayMs);
    this.pendingCounts.set(key, timer);
  }

  /** Перепроверить ссылки объявлений видимых документов. */
  private async refreshVisibleDocuments(): Promise<void> {
    const visible = new Set(vscode.window.visibleTextEditors.map((editor) => editor.document.uri.toString()));
    await this.recomputeCachedCounts((entry): boolean => visible.has(entry.declaration.documentUri.toString()));
  }

  /**
   * Пересчитать ссылки.
   * @param documentUri Ограничить пересчёт одним документом.
   */
  private async recomputeReferences(documentUri?: vscode.Uri): Promise<void> {
    await this.recomputeCachedCounts(
      documentUri ? (entry): boolean => entry.declaration.documentUri.toString() === documentUri.toString() : undefined,
    );
  }

  /**
   * Пересчитать закэшированные числа ссылок по фильтру и уведомить, если они изменились.
   * @description Кэш ссылок сбрасывается всегда, даже если пересчёт уже идёт; пропущенный из-за занятости
   * пересчёт повторяется после завершения текущего.
   * @param match Фильтр записей; без него берутся все.
   */
  private async recomputeCachedCounts(match?: (entry: ICodeLensCacheEntry) => boolean): Promise<void> {
    ReferenceSearch.clearCache();

    if (this.isRecomputing) {
      this.isRecomputeQueued = true;
      return;
    }

    this.isRecomputing = true;

    try {
      let changed = false;
      for (const [key, entry] of this.referenceCounts) {
        if (match && !match(entry)) continue;

        const references = await this.countReferences(entry.declaration);
        if (AdditionalCodeLensProvider.isSameLocations(references, entry.references)) continue;

        if (references.length === 0) this.referenceCounts.delete(key);
        else this.referenceCounts.set(key, { declaration: entry.declaration, references: references });

        changed = true;
      }

      if (changed) this.lensesChanged.fire();
    } finally {
      this.isRecomputing = false;
    }

    if (this.isRecomputeQueued) {
      this.isRecomputeQueued = false;
      await this.recomputeCachedCounts();
    }
  }

  /**
   * Посчитать ссылки объявления.
   * @description Позиция могла устареть (документ изменился), поэтому сначала проверяем, что строка ещё
   * существует; иначе запрос к Roslyn падает.
   * @param declaration Данные объявления.
   * @returns Ссылки.
   */
  private async countReferences(declaration: IDeclarationCodeLens): Promise<Array<vscode.Location>> {
    try {
      const document = await vscode.workspace.openTextDocument(declaration.documentUri);
      if (declaration.position.line >= document.lineCount) return [];

      const references = (await VSCodeApi.getReferencesAt(declaration.documentUri, declaration.position)) ?? [];
      return ReferenceSearch.deduplicateLocations(references);
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to count references for ${declaration.documentUri.toString()}:${declaration.position.line}: ${String(error)}`,
      );
      return [];
    }
  }

  /**
   * Совпадают ли наборы ссылок.
   * @param left Первый набор.
   * @param right Второй набор.
   * @returns true - если наборы одинаковы.
   */
  private static isSameLocations(left: Array<vscode.Location>, right: Array<vscode.Location>): boolean {
    if (left.length !== right.length) return false;
    const keys = new Set(left.map((location) => AdditionalCodeLensProvider.locationCacheKey(location)));
    return right.every((location) => keys.has(AdditionalCodeLensProvider.locationCacheKey(location)));
  }

  /**
   * Ключ объявления для кэша.
   * @param declaration Данные объявления.
   * @returns Строковый ключ.
   */
  private static declarationCacheKey(declaration: IDeclarationCodeLens): string {
    return `${declaration.documentUri.toString()}|${declaration.position.line}:${declaration.position.character}`;
  }

  /**
   * Ключ ссылки для кэша.
   * @param location Ссылка.
   * @returns Строковый ключ.
   */
  private static locationCacheKey(location: vscode.Location): string {
    return `${location.uri.toString()}|${location.range.start.line}:${location.range.start.character}`;
  }
}
