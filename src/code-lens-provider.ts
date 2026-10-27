import * as vscode from 'vscode';
import { ReferenceSearch } from './reference-search';
import { isWrapperFile } from './utils';
import * as VSCodeApi from './vscode-api';
import { WrapperLocator } from './wrapper-locator';

/** Объявление, к которому привязана линза. */
interface ICodeLensDeclaration {
  /** Uri документа с объявлением. */
  documentUri: vscode.Uri;
  /** Позиция объявления. */
  position: vscode.Position;
}

/** Линза с прикреплёнными данными объявления. */
interface ICodeLensData extends vscode.CodeLens {
  /** Данные объявления. */
  declaration?: ICodeLensDeclaration;
}

/** Запись кэша: объявление и найденные для него ссылки. */
interface ICodeLensCacheEntry {
  /** Данные объявления. */
  declaration: ICodeLensDeclaration;
  /** Найденные ссылки. */
  references: Array<vscode.Location>;
  /** Признак, что после события число устарело и требует пересчёта. */
  stale: boolean;
}

/**
 * Дополнительный поставщик CodeLens «N references».
 * @description Штатная линза C#-расширения считает только прямые ссылки Roslyn и не учитывает места
 * использования через обёртки. Линза считает объединённые ссылки, но с задержкой и обновляет число
 * только когда набор ссылок реально изменился.
 *
 * Числа пересчитываются **только по событиям** (изменение, сохранение и закрытие документа, перегенерация
 * обёрток).
 */
export class AdditionalCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  /** Эмиттер изменения списка линз. */
  private readonly lensesChanged = new vscode.EventEmitter<void>();

  /** Задержка первого расчёта числа ссылок (мс). */
  private static readonly firstCountDelayMs = 1500;

  /** Кэш ссылок: ключ (uri + позиция) -> объявление и ссылки. */
  private readonly referenceCounts = new Map<string, ICodeLensCacheEntry>();

  /** Отложенные расчёты: ключ объявления -> таймер. */
  private readonly pendingCounts = new Map<string, NodeJS.Timeout>();

  /** Отложенное событие изменения линз: коалессинг пачки завершённых расчётов. */
  private fireTimer: NodeJS.Timeout | undefined;

  /**
   * Поколение инвалидации: растёт при полном сбросе кэша.
   * @description Расчёт ссылок асинхронный, поэтому результат, запущенный до сброса, не должен попасть обратно
   * в кэш: иначе линза покажет устаревшее число до следующего события. Растёт только при полном сбросе:
   * при закрытии одного документа его расчёты гасятся удалением записей и таймеров, а расчёты других
   * документов не должны отбрасываться - иначе незакрытые линзы пересчитываются бесконечно.
   */
  private invalidationGeneration = 0;

  /** Событие изменения списка линз. */
  public readonly onDidChangeCodeLenses = this.lensesChanged.event;

  /**
   * Конструктор.
   * @param logger Логгер расширения.
   */
  constructor(private readonly logger: vscode.LogOutputChannel) {}

  /**
   * Пометить все закэшированные числа ссылок устаревшими: набор ссылок мог измениться в любом файле.
   * @description Линзы воркбенч перезапрашивает сам (событие onDidChangeCodeLenses), а расчёт остаётся
   * ленивым - при разрешении линзы. Прежнее число не сбрасывается: подписи не должны пропадать на время
   * пересчёта, а свежее значение заменит его по готовности.
   */
  public invalidateAll(): void {
    for (const timer of this.pendingCounts.values()) clearTimeout(timer);
    this.pendingCounts.clear();
    for (const entry of this.referenceCounts.values()) entry.stale = true;
    this.invalidationGeneration++;
    ReferenceSearch.clearCache();
    this.lensesChanged.fire();
  }

  /**
   * Забыть ссылки и отложенные расчёты документа.
   * @param uri Uri документа.
   */
  public clearDocumentReferences(uri: vscode.Uri): void {
    this.dropDocumentEntries(uri);
  }

  /** Освободить ресурсы. */
  public dispose(): void {
    for (const timer of this.pendingCounts.values()) clearTimeout(timer);
    this.pendingCounts.clear();
    this.invalidationGeneration++;
    if (this.fireTimer) {
      clearTimeout(this.fireTimer);
      this.fireTimer = undefined;
    }
    this.lensesChanged.dispose();
  }

  /**
   * Вернуть линзы для объявлений документа.
   * @param document Документ.
   * @param token Токен отмены.
   * @returns Массив {@link vscode.CodeLens линз}.
   */
  public async provideCodeLenses(
    document: vscode.TextDocument,
    token?: vscode.CancellationToken,
  ): Promise<Array<vscode.CodeLens>> {
    if (isWrapperFile(document.uri)) return [];

    const declarations = await WrapperLocator.findReferenceableDeclarations(document.uri);
    if (token?.isCancellationRequested) return [];

    return declarations.map((symbol) => {
      const codeLens = new vscode.CodeLens(symbol.selectionRange) as ICodeLensData;
      codeLens.declaration = { documentUri: document.uri, position: symbol.selectionRange.start };
      return codeLens;
    });
  }

  /**
   * Разрешить линзу: показать закэшированное число либо запланировать отложенный расчёт.
   * @description Устаревшее число показывается сразу, а свежее считается в фоне: подпись не должна
   * пропадать на время пересчёта.
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

    if (entry.stale) this.scheduleCount(declaration);

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
  /**
   * Запросить одно событие изменения линз на пачку завершённых расчётов.
   */
  private queueLensesChanged(): void {
    if (this.fireTimer) return;
    this.fireTimer = setTimeout(() => {
      this.fireTimer = undefined;
      this.lensesChanged.fire();
    }, 0);
  }

  private scheduleCount(declaration: ICodeLensDeclaration): void {
    const key = AdditionalCodeLensProvider.declarationCacheKey(declaration);
    if (this.pendingCounts.has(key)) return;

    const generation = this.invalidationGeneration;
    const timer = setTimeout(() => {
      this.pendingCounts.delete(key);
      void this.countReferences(declaration).then((locations) => {
        if (generation !== this.invalidationGeneration) return;
        if (locations.length === 0) {
          // Устаревшая подпись должна исчезнуть, а пустой результат по-прежнему не кэшируется.
          if (this.referenceCounts.delete(key)) this.queueLensesChanged();
          return;
        }
        this.referenceCounts.set(key, { declaration, references: locations, stale: false });
        this.queueLensesChanged();
      });
    }, AdditionalCodeLensProvider.firstCountDelayMs);
    this.pendingCounts.set(key, timer);
  }

  /**
   * Забыть записи кэша и отложенные расчёты документа.
   * @param uri Uri документа.
   */
  private dropDocumentEntries(uri: vscode.Uri): void {
    const prefix = `${uri.toString()}|`;
    for (const [key, timer] of this.pendingCounts) {
      if (!key.startsWith(prefix)) continue;
      clearTimeout(timer);
      this.pendingCounts.delete(key);
    }
    for (const key of [...this.referenceCounts.keys()]) {
      if (key.startsWith(prefix)) this.referenceCounts.delete(key);
    }
  }

  /**
   * Посчитать ссылки объявления.
   * @description Позиция могла устареть (документ изменился), поэтому сначала проверяем, что строка ещё
   * существует; иначе запрос к Roslyn падает.
   * @param declaration Данные объявления.
   * @returns Ссылки.
   */
  private async countReferences(declaration: ICodeLensDeclaration): Promise<Array<vscode.Location>> {
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
   * Ключ объявления для кэша.
   * @param declaration Данные объявления.
   * @returns Строковый ключ.
   */
  private static declarationCacheKey(declaration: ICodeLensDeclaration): string {
    return `${declaration.documentUri.toString()}|${declaration.position.line}:${declaration.position.character}`;
  }
}
