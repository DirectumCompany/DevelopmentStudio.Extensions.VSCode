import * as vscode from 'vscode';
import { AdditionalCodeLensProvider } from './code-lens-provider';
import { documentLinesCache } from './document-lines-cache';
import { ReferenceSearch } from './reference-search';

/** Пауза перед сбросом кэшей документа после правок в редакторе (мс). */
export const defaultInvalidationDelayMs = 2000;

/** Параметры подписки на изменения файлов. */
export interface IDocumentCacheInvalidationOptions {
  /** Поставщик линз: его числа ссылок зависят от содержимого файлов. */
  codeLensProvider: AdditionalCodeLensProvider;
  /** Пауза перед сбросом кэшей документа (мс). */
  delayMs?: number;
}

/**
 * Подписать кэши строк и чисел ссылок на изменения файлов.
 * @description Отслеживает правки документов и записи файлов на диске.
 * @param options Параметры подписки.
 * @returns Подписка, снимающая наблюдатель и отложенные сбросы.
 */
export function registerDocumentCacheInvalidation(
  options: IDocumentCacheInvalidationOptions,
): vscode.Disposable {
  const delayMs = options.delayMs ?? defaultInvalidationDelayMs;

  /** Отложенные сбросы кэшей документа: ключ - uri документа. */
  const pendingInvalidations = new Map<string, NodeJS.Timeout>();

  /** Отложенный пересчёт чисел ссылок после массовой перегенерации обёрток. */
  let lensInvalidationTimer: NodeJS.Timeout | undefined;

  const dropDocumentCaches = (uri: vscode.Uri): void => {
    documentLinesCache.invalidate(uri);
    options.codeLensProvider.invalidateAll();
  };

  const scheduleInvalidation = (uri: vscode.Uri): void => {
    const key = uri.toString();
    const pending = pendingInvalidations.get(key);
    if (pending) clearTimeout(pending);

    pendingInvalidations.set(
      key,
      setTimeout(() => {
        pendingInvalidations.delete(key);
        dropDocumentCaches(uri);
      }, delayMs),
    );
  };

  const scheduleLensInvalidation = (): void => {
    if (lensInvalidationTimer) clearTimeout(lensInvalidationTimer);
    lensInvalidationTimer = setTimeout(() => {
      lensInvalidationTimer = undefined;
      options.codeLensProvider.invalidateAll();
    }, delayMs);
  };

  const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.{g.cs,resx,sql}');
  const fileChanged = (uri: vscode.Uri): void => {
    documentLinesCache.invalidate(uri);
    if (!uri.path.endsWith('.g.cs')) return;

    ReferenceSearch.clearCache();
    scheduleLensInvalidation();
  };

  return vscode.Disposable.from(
    fileWatcher,
    fileWatcher.onDidChange(fileChanged),
    fileWatcher.onDidCreate(fileChanged),
    fileWatcher.onDidDelete(fileChanged),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId !== 'csharp') return;
      scheduleInvalidation(event.document.uri);
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.languageId !== 'csharp') return;
      documentLinesCache.invalidate(document.uri);
      options.codeLensProvider.invalidateAll();
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      // Правка могла запланировать сброс кэшей: после закрытия документа он не нужен.
      const key = document.uri.toString();
      const pending = pendingInvalidations.get(key);
      if (pending) {
        clearTimeout(pending);
        pendingInvalidations.delete(key);
      }
      documentLinesCache.invalidate(document.uri);
      options.codeLensProvider.clearDocumentReferences(document.uri);
    }),
    new vscode.Disposable(() => {
      for (const timer of pendingInvalidations.values()) clearTimeout(timer);
      pendingInvalidations.clear();
      if (lensInvalidationTimer) clearTimeout(lensInvalidationTimer);
      lensInvalidationTimer = undefined;
    }),
  );
}
