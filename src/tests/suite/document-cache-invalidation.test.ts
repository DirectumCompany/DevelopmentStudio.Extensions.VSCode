import * as assert from 'assert';
import * as fs from 'fs';
import * as vscode from 'vscode';

import { AdditionalCodeLensProvider } from '../../code-lens-provider';
import { registerDocumentCacheInvalidation } from '../../document-cache-invalidation';
import { documentLinesCache } from '../../document-lines-cache';

/** Проверка подписки на изменения файлов: правка вне редактора должна сбрасывать кэш строк. */
suite('DocumentCacheInvalidation', function () {
  this.timeout(60000);

  const workspace = vscode.workspace.workspaceFolders![0];
  const prober = ['DocumentCacheInvalidationProbe.resx', 'DocumentCacheInvalidationProbe.g.cs'];
  const probeUris = prober.map((name) => vscode.Uri.joinPath(workspace.uri, name));
  const logger = vscode.window.createOutputChannel('document-cache-invalidation-test', { log: true });

  /**
   * Подписать кэши на изменения файлов с короткой паузой.
   * @returns Подписка.
   */
  const subscribe = (): vscode.Disposable =>
    registerDocumentCacheInvalidation({ codeLensProvider: new AdditionalCodeLensProvider(logger), delayMs: 1000 });

  setup(() => {
    for (const uri of probeUris) documentLinesCache.invalidate(uri);
  });

  teardown(async () => {
    for (const uri of probeUris) {
      documentLinesCache.invalidate(uri);
      try {
        await vscode.workspace.fs.delete(uri, { useTrash: false });
      } catch {
        // файла может не быть - это нормально
      }
    }
  });

  // Файлы обоих форматов должны попадать в общий наблюдатель: обёртки - поток от генератора, ресурсы - запись мимо редактора.
  for (const [index, probeUri] of probeUris.entries()) {
    test(`внешняя запись ${prober[index]} сбрасывает кэш строк`, async () => {
      const subscription = subscribe();

      try {
        fs.writeFileSync(probeUri.fsPath, '<root>before</root>\n', 'utf8');
        const before = await documentLinesCache.get(probeUri);

        // Так же пишет команда создания ресурса: файл меняется на диске, редактор об этом не знает.
        fs.writeFileSync(probeUri.fsPath, '<root>after</root>\n', 'utf8');

        const after = await waitForReRead(probeUri, before);
        assert.ok(after?.join('\n').includes('after'), 'запись файла вне редактора должна сбросить кэш строк');
      } finally {
        subscription.dispose();
      }
    });
  }

  test('после отписки изменения файла не сбрасывают кэш', async () => {
    const subscription = subscribe();
    subscription.dispose();
    const probeUri = probeUris[0];

    fs.writeFileSync(probeUri.fsPath, '<root>first</root>\n', 'utf8');
    const before = await documentLinesCache.get(probeUri);

    fs.writeFileSync(probeUri.fsPath, '<root>second</root>\n', 'utf8');
    await delay(4000);

    assert.strictEqual(
      await documentLinesCache.get(probeUri),
      before,
      'без подписки наблюдатель не должен сбрасывать кэш',
    );
  });
});

/**
 * Дождаться, пока кэш вернёт другие строки.
 * @param uri Uri файла.
 * @param before Строки до правки файла.
 * @returns Новые строки либо undefined, если событие не пришло.
 */
async function waitForReRead(uri: vscode.Uri, before: Array<string>): Promise<Array<string> | undefined> {
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    const lines = await documentLinesCache.get(uri);
    if (lines !== before) return lines;
    await delay(250);
  }
  return undefined;
}

/**
 * Пауза.
 * @param ms Длительность паузы (мс).
 * @returns Промис, завершающийся после паузы.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
