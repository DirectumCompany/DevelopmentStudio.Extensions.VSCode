/* eslint-disable jsdoc/require-jsdoc */
import * as assert from 'assert';
import * as vscode from 'vscode';

import { AdditionalCodeLensProvider } from '../../code-lens-provider';
import { WrapperLocator } from '../../wrapper-locator';

/** Приватные статические задержки провайдера, укорачиваемые в тестах. */
interface IProviderTimers {
  firstCountDelayMs: number;
}

/** Данные объявления, прикрепляемые провайдером к линзе. */
interface IDeclarationCodeLens {
  documentUri: vscode.Uri;
  position: vscode.Position;
}

/** Приватные методы провайдера, подменяемые в тестах. */
interface IProviderInternals {
  countReferences(declaration: IDeclarationCodeLens): Promise<Array<vscode.Location>>;
}

/** Линза с прикреплёнными данными объявления. */
interface ICodeLensData extends vscode.CodeLens {
  declaration?: IDeclarationCodeLens;
}

const timers = AdditionalCodeLensProvider as unknown as IProviderTimers;

// Подождать указанное время.
const delay = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
};

// Дождаться события изменения списка линз.
const nextChange = (provider: AdditionalCodeLensProvider): Promise<void> => {
  const holder: { subscription?: vscode.Disposable } = {};
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      holder.subscription?.dispose();
      reject(new Error('onDidChangeCodeLenses did not fire'));
    }, 5000);
    holder.subscription = provider.onDidChangeCodeLenses(() => {
      clearTimeout(timer);
      holder.subscription?.dispose();
      resolve();
    });
  });
};

suite('AdditionalCodeLensProvider', function () {
  this.timeout(30000);

  const workspace = vscode.workspace.workspaceFolders![0];
  const sourceUri = vscode.Uri.joinPath(workspace.uri, 'ModuleSharedFunctions.cs');
  const logger = vscode.window.createOutputChannel('code-lens-provider-tests', { log: true });
  const originalFindDeclarations = WrapperLocator.findReferenceableDeclarations.bind(WrapperLocator);

  let provider: AdditionalCodeLensProvider;
  let computeResult: Array<vscode.Location> = [];
  let computeCalls = 0;

  const location = (line: number): vscode.Location => new vscode.Location(sourceUri, new vscode.Position(line, 0));

  // Фиктивные объявления: провайдеру нужен только selectionRange.
  const declarations = (): Array<vscode.DocumentSymbol> =>
    [new vscode.Range(2, 14, 2, 15), new vscode.Range(2, 20, 2, 21)].map(
      (range) => ({ selectionRange: range }) as unknown as vscode.DocumentSymbol,
    );

  // Подменить приватный расчёт ссылок управляемым набором.
  const stubCompute = (target: AdditionalCodeLensProvider): void => {
    (target as unknown as IProviderInternals).countReferences = (): Promise<Array<vscode.Location>> => {
      computeCalls++;
      return Promise.resolve(computeResult);
    };
  };

  const lensFor = async (target: AdditionalCodeLensProvider): Promise<vscode.CodeLens> => {
    const document = await vscode.workspace.openTextDocument(sourceUri);
    const lenses = await target.provideCodeLenses(document);
    return lenses[0];
  };
  const firstLens = (): Promise<vscode.CodeLens> => lensFor(provider);

  setup(() => {
    timers.firstCountDelayMs = 20;
    computeResult = [];
    computeCalls = 0;
    WrapperLocator.findReferenceableDeclarations = (): Promise<Array<vscode.DocumentSymbol>> =>
      Promise.resolve(declarations());
    provider = new AdditionalCodeLensProvider(logger);
    stubCompute(provider);
  });

  teardown(() => {
    provider.dispose();
    WrapperLocator.findReferenceableDeclarations = originalFindDeclarations;
  });

  suiteTeardown(() => {
    timers.firstCountDelayMs = 1500;
    logger.dispose();
  });

  test('lens has no command before the compute and shows 1 reference after the change event', async () => {
    const lens = await firstLens();
    assert.strictEqual<vscode.Command | undefined>(
      lens.command,
      undefined,
      'the lens must not show a count before the first compute',
    );

    computeResult = [location(0)];
    const changed = nextChange(provider);
    provider.resolveCodeLens(lens);
    assert.strictEqual<vscode.Command | undefined>(lens.command, undefined, 'the count must not appear synchronously');
    await changed;

    provider.resolveCodeLens(lens);
    assert.strictEqual(lens.command?.title, '1 reference');
    assert.strictEqual(lens.command?.command, 'editor.action.showReferences');
    const target = lens.command?.arguments?.[0] as vscode.Uri;
    assert.ok(target instanceof vscode.Uri, 'the command must point at the declaration document');
    assert.strictEqual(target.toString(), sourceUri.toString());
  });

  test('lens shows the plural count', async () => {
    computeResult = [location(0), location(1), location(2)];
    const lens = await firstLens();
    const changed = nextChange(provider);
    provider.resolveCodeLens(lens);
    await changed;

    provider.resolveCodeLens(lens);
    assert.strictEqual(lens.command?.title, '3 references');
  });

  test('a zero result is not cached and does not fire the change event', async () => {
    computeResult = [];
    const lens = await firstLens();
    let fired = false;
    const subscription = provider.onDidChangeCodeLenses(() => {
      fired = true;
    });

    provider.resolveCodeLens(lens);
    await delay(150);
    provider.resolveCodeLens(lens);

    assert.strictEqual(lens.command, undefined, 'an empty result must not produce a count');
    assert.strictEqual(fired, false, 'an empty result must not fire the change event');
    subscription.dispose();
  });

  test('a compute that finished after invalidateAll does not restore the stale count', async () => {
    const lens = await firstLens();
    let release: ((locations: Array<vscode.Location>) => void) | undefined;
    (provider as unknown as IProviderInternals).countReferences = (): Promise<Array<vscode.Location>> =>
      new Promise<Array<vscode.Location>>((resolve) => {
        release = resolve;
      });

    provider.resolveCodeLens(lens);
    await delay(80);
    provider.invalidateAll();
    assert.ok(release, 'the count must be running when the cache is dropped');
    release([location(0)]);
    await delay(80);

    const repeated = await firstLens();
    provider.resolveCodeLens(repeated);

    assert.strictEqual(
      repeated.command,
      undefined,
      'the count computed before the invalidation must not be cached',
    );
  });

  test('clearing another document does not drop the running compute', async () => {
    const lens = await firstLens();
    let release: ((locations: Array<vscode.Location>) => void) | undefined;
    (provider as unknown as IProviderInternals).countReferences = (): Promise<Array<vscode.Location>> =>
      new Promise<Array<vscode.Location>>((resolve) => {
        release = resolve;
      });

    provider.resolveCodeLens(lens);
    await delay(80);
    provider.clearDocumentReferences(vscode.Uri.file('D:/other-workspace/Other.cs'));
    assert.ok(release, 'the count must be running when another document is closed');
    release([location(0)]);
    await delay(80);

    const repeated = await firstLens();
    provider.resolveCodeLens(repeated);

    assert.strictEqual(
      repeated.command?.title,
      '1 reference',
      'closing another document must not drop the count of this one',
    );
  });

  test('resolving the same target twice counts references once', async () => {
    computeResult = [location(0)];
    const lens = await firstLens();

    provider.resolveCodeLens(lens);
    provider.resolveCodeLens(lens);
    await delay(150);

    assert.strictEqual(computeCalls, 1, 'a repeated resolve must not schedule a second count');
  });

  test('invalidateAll keeps the shown count and schedules a recount', async () => {
    computeResult = [location(0)];
    const lens = await firstLens();
    const first = nextChange(provider);
    provider.resolveCodeLens(lens);
    await first;
    provider.resolveCodeLens(lens);
    assert.strictEqual(lens.command?.title, '1 reference', 'the count must be cached');

    let fired = false;
    const subscription = provider.onDidChangeCodeLenses(() => {
      fired = true;
    });
    provider.invalidateAll();
    assert.strictEqual(fired, true, 'invalidateAll must fire the change event');

    // Устаревшее число показывается сразу, а свежее считается в фоне.
    computeResult = [location(0), location(1)];
    const refreshed = await firstLens();
    const recount = nextChange(provider);
    provider.resolveCodeLens(refreshed);
    assert.strictEqual(refreshed.command?.title, '1 reference', 'the stale count must stay visible');
    await recount;

    const updated = await firstLens();
    provider.resolveCodeLens(updated);
    assert.strictEqual(updated.command?.title, '2 references', 'the fresh count must replace the stale one');
    subscription.dispose();
  });

  test('an empty recount removes the stale count', async () => {
    computeResult = [location(0)];
    const lens = await firstLens();
    const first = nextChange(provider);
    provider.resolveCodeLens(lens);
    await first;

    provider.invalidateAll();
    computeResult = [];
    const refreshed = await firstLens();
    const recount = nextChange(provider);
    provider.resolveCodeLens(refreshed);
    await recount;

    const after = await firstLens();
    provider.resolveCodeLens(after);
    assert.strictEqual(after.command, undefined, 'an empty recount must drop the stale count');
  });
  test('clearDocumentReferences drops the cached count', async () => {
    computeResult = [location(0)];
    const lens = await firstLens();
    const changed = nextChange(provider);
    provider.resolveCodeLens(lens);
    await changed;
    provider.resolveCodeLens(lens);
    assert.strictEqual(lens.command?.title, '1 reference', 'the count must be cached');

    provider.clearDocumentReferences(sourceUri);
    lens.command = undefined;
    provider.resolveCodeLens(lens);
    assert.strictEqual(lens.command, undefined, 'clearing must drop the cached count');
  });

  test('clearDocumentReferences cancels the pending compute', async () => {
    timers.firstCountDelayMs = 300;
    const lens = await firstLens();

    provider.resolveCodeLens(lens);
    provider.clearDocumentReferences(sourceUri);
    await delay(400);

    assert.strictEqual(computeCalls, 0, 'the scheduled compute must be cancelled');
  });

  test('dispose cancels a pending compute', async () => {
    timers.firstCountDelayMs = 500;
    const disposableProvider = new AdditionalCodeLensProvider(logger);
    stubCompute(disposableProvider);
    const lens = await lensFor(disposableProvider);

    disposableProvider.resolveCodeLens(lens);
    disposableProvider.dispose();
    await delay(700);

    assert.strictEqual(computeCalls, 0, 'a pending compute must not run after dispose');
  });

  test('idle does not recompute anything (no periodic recheck)', async () => {
    computeResult = [location(0)];
    const document = await vscode.workspace.openTextDocument(sourceUri);
    await vscode.window.showTextDocument(document);

    const lens = await firstLens();
    const changed = nextChange(provider);
    provider.resolveCodeLens(lens);
    await changed;

    const afterFirstCount = computeCalls;
    // Ожидание реальных 2 с здесь вынужденное: проверяется именно отсутствие пересчёта в простое,
    // ускорить паузу нельзя - иначе между расчётами не останется окна наблюдения.
    await delay(2000);

    assert.strictEqual(computeCalls, afterFirstCount, 'an idle provider must not recompute references');
  });

  test('a stale position yields no references and is not cached', async () => {
    const realProvider = new AdditionalCodeLensProvider(logger);
    try {
      const stale = new vscode.CodeLens(new vscode.Range(0, 0, 0, 0)) as ICodeLensData;
      stale.declaration = { documentUri: sourceUri, position: new vscode.Position(500, 0) };

      const found = await (realProvider as unknown as IProviderInternals).countReferences(stale.declaration);
      assert.deepStrictEqual(found, [], 'a position beyond the document must yield no references');

      realProvider.resolveCodeLens(stale);
      await delay(150);
      realProvider.resolveCodeLens(stale);
      assert.strictEqual(stale.command, undefined, 'a stale position must not be cached');
    } finally {
      realProvider.dispose();
    }
  });
});
