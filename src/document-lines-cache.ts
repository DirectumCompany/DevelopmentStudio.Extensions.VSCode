import * as vscode from 'vscode';

/** Запись кэша строк документа. */
interface IDocumentLinesCacheEntry {
  /** Версия открытого документа; null - документ не открыт в редакторе. */
  version: number | null;
  /** Строки документа. */
  lines: Array<string>;
}

/**
 * Кэш строк документов.
 * @description Строки кэшируются до изменения файла.
 */
export class DocumentLinesCache implements vscode.Disposable {
  /** Предельное число файлов в кэше. */
  private static readonly maxEntries = 64;

  /** Кэш строк: ключ - uri документа. Порядок ключей задаёт давность использования. */
  private readonly cache = new Map<string, IDocumentLinesCacheEntry>();

  /** Чтения с диска «в полёте»: обёртки одного файла запрашиваются параллельно. */
  private readonly pendingReads = new Map<string, Promise<Array<string>>>();

  /**
   * Вернуть строки документа: из кэша, из открытого документа либо чтением файла.
   * @param uri Uri документа.
   * @returns Строки документа.
   */
  public async get(uri: vscode.Uri): Promise<Array<string>> {
    const key = uri.toString();
    const openDocument = vscode.workspace.textDocuments.find((document) => document.uri.toString() === key);
    const cached = this.cache.get(key);

    if (cached && (!openDocument || cached.version === openDocument.version)) return this.touch(key, cached).lines;

    if (openDocument) {
      return this.store(key, { version: openDocument.version, lines: openDocument.getText().split('\n') });
    }

    const pending = this.pendingReads.get(key);
    if (pending) return pending;

    const read: Promise<Array<string>> = Promise.resolve(vscode.workspace.fs.readFile(uri)).then((buffer) => {
      const lines = buffer.toString().split('\n');
      // Если за время чтения файл инвалидировали, устаревшие строки не должны вернуться в кэш.
      if (this.pendingReads.get(key) === read) this.store(key, { version: null, lines });
      return lines;
    });
    this.pendingReads.set(key, read);
    try {
      return await read;
    } finally {
      // Не удалять чтение, начатое после инвалидации.
      if (this.pendingReads.get(key) === read) this.pendingReads.delete(key);
    }
  }

  /**
   * Забыть строки документа.
   * @param uri Uri документа.
   */
  public invalidate(uri: vscode.Uri): void {
    this.cache.delete(uri.toString());
    this.pendingReads.delete(uri.toString());
  }

  /** Освободить ресурсы. */
  public dispose(): void {
    this.cache.clear();
    this.pendingReads.clear();
  }

  /**
   * Положить запись в кэш, вытеснив самую давнюю при переполнении.
   * @param key Ключ.
   * @param entry Запись.
   * @returns Строки из записи.
   */
  private store(key: string, entry: IDocumentLinesCacheEntry): Array<string> {
    this.cache.delete(key);
    this.cache.set(key, entry);

    while (this.cache.size > DocumentLinesCache.maxEntries) {
      const oldest = this.cache.keys().next();
      if (oldest.done) break;
      this.cache.delete(oldest.value);
    }
    return entry.lines;
  }

  /**
   * Отметить запись как только что использованную.
   * @param key Ключ.
   * @param entry Запись.
   * @returns Запись.
   */
  private touch(key: string, entry: IDocumentLinesCacheEntry): IDocumentLinesCacheEntry {
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry;
  }
}

/** Общий экземпляр кэша: используется поиском обёрток и точкой активации расширения. */
export const documentLinesCache = new DocumentLinesCache();
