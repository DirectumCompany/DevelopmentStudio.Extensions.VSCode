import * as assert from 'assert';
import * as vscode from 'vscode';

import { DocumentLinesCache } from '../../document-lines-cache';

/** Проверка кэша строк документов: поиск обёрток не должен перечитывать файлы целиком на каждый запрос. */
suite('DocumentLinesCache', function () {
  this.timeout(60000);

  const workspace = vscode.workspace.workspaceFolders![0];
  const fileUri = vscode.Uri.joinPath(workspace.uri, 'DocumentLinesCacheProbe.cs');
  const cache = new DocumentLinesCache();

  setup(async () => {
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from('class Probe\n{\n  void A() { }\n}\n'));
  });

  teardown(async () => {
    cache.dispose();
    try {
      await vscode.workspace.fs.delete(fileUri, { useTrash: false });
    } catch {
      // файла может не быть - это нормально
    }
  });

  test('reads the file once and serves the next request from the cache', async () => {
    const first = await cache.get(fileUri);
    const second = await cache.get(fileUri);

    assert.strictEqual(first, second, 'the second request must reuse the cached lines');
    assert.ok(first.length > 1, 'the cache must return the document lines');
  });

  test('invalidate during a pending read does not restore the stale lines', async () => {
    // Чтение началось, но ещё не завершилось: инвалидация в этот момент не должна оставить его строки в кэше.
    cache.invalidate(fileUri);
    const pending = cache.get(fileUri);
    cache.invalidate(fileUri);
    const pendingLines = await pending;

    const rereadLines = await cache.get(fileUri);
    assert.notStrictEqual(rereadLines, pendingLines, 'устаревшее чтение не должно попасть в кэш');
  });

  test('invalidate forces a re-read of the same content', async () => {
    const first = await cache.get(fileUri);
    cache.invalidate(fileUri);
    const second = await cache.get(fileUri);

    assert.notStrictEqual(first, second, 'after invalidation the lines must be read again');
    assert.deepStrictEqual(first, second, 'the content must not change');
  });

  test('an edited document is not served from the cache', async () => {
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);
    const before = await cache.get(fileUri);

    const edit = new vscode.WorkspaceEdit();
    edit.insert(fileUri, new vscode.Position(0, 0), '// probe\n');
    assert.ok(await vscode.workspace.applyEdit(edit), 'the edit must be applied');

    const after = await cache.get(fileUri);
    assert.notStrictEqual(before, after, 'an edited document must be re-read');
    assert.ok(after[0].includes('probe'), 'the cache must return the edited content');
  });

  test('parallel reads of one file are served by a single read', async () => {
    const parallelUri = vscode.Uri.joinPath(workspace.uri, 'DocumentLinesCacheParallelProbe.cs');
    await vscode.workspace.fs.writeFile(parallelUri, Buffer.from('class Parallel { }\n'));

    try {
      const [first, second, third] = await Promise.all([
        cache.get(parallelUri),
        cache.get(parallelUri),
        cache.get(parallelUri),
      ]);

      // Каждое отдельное чтение даёт свой массив: одинаковый результат означает переиспользованное чтение.
      assert.strictEqual(first, second, 'одновременные запросы должны переиспользовать одно чтение');
      assert.strictEqual(second, third, 'одновременные запросы должны переиспользовать одно чтение');
    } finally {
      try {
        await vscode.workspace.fs.delete(parallelUri, { useTrash: false });
      } catch {
        // файла может не быть - это нормально
      }
    }
  });

  test('the cache does not grow beyond its bound', async () => {
    const files: Array<vscode.Uri> = [];
    const lines: Array<Array<string>> = [];

    for (let index = 0; index < 70; index++) {
      const uri = vscode.Uri.joinPath(workspace.uri, `DocumentLinesCacheProbe${index}.cs`);
      await vscode.workspace.fs.writeFile(uri, Buffer.from(`class Probe${index} { }\n`));
      files.push(uri);
      lines.push(await cache.get(uri));
    }

    assert.strictEqual(await cache.get(files[69]), lines[69], 'the newest entry must stay cached');
    assert.notStrictEqual(await cache.get(files[0]), lines[0], 'the oldest entry must be evicted');

    for (const uri of files) {
      try {
        await vscode.workspace.fs.delete(uri, { useTrash: false });
      } catch {
        // файла может не быть - это нормально
      }
    }
  });
});
