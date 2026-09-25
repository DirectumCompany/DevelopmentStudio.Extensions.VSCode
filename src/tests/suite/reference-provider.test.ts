import * as assert from 'assert';
import * as vscode from 'vscode';

import { ReferenceSearch } from '../../reference-search';

/** Имена файлов фикстуры. */
const generatedFile = 'RefTest.g.cs';
const originalFile = 'RefTestOriginal.cs';
const usagesFile = 'RefTestUsages.cs';

// Подождать указанное время.
const delay = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
};

suite('AdditionalReferenceProvider', function () {
  // Индексация Roslyn в тестовом воркспейсе может занимать секунды.
  this.timeout(120000);

  const workspace = vscode.workspace.workspaceFolders![0];
  const uriOf = (fileName: string): vscode.Uri => vscode.Uri.joinPath(workspace.uri, fileName);
  const href = (fileName: string): string => `file:///${workspace.uri.path}/${fileName}`;

  // Обёртки в g.cs: функция (с похожим именем-двойником), структура со свойством и константа.
  const generatedContent = `
namespace Company.RefTest.Functions
{
  internal static partial class Module
  {
    /// <summary>
    /// <see href="${href(originalFile)}" internal="" />
    /// </summary>
    internal static void PrefixFunctionA(global::System.Int32 a) {}

    /// <summary>
    /// <see href="${href(originalFile)}" internal="" />
    /// </summary>
    internal static void PrefixFunctionA(global::System.Int32 a, global::System.Int32 b) {}

    /// <summary>
    /// <see href="${href(originalFile)}" internal="" />
    /// </summary>
    internal static void PrefixFunctionAB(global::System.Int32 a) {}
  }
}

namespace Company.RefTest.Structures.Module
{
  /// <summary>
  /// <see href="${href(originalFile)}" internal="" />
  /// </summary>
  public interface IWidget
  {
    /// <summary>
    /// <see href="${href(originalFile)}" internal="" />
    /// </summary>
    global::System.Int32 RefTestWidgetId { get; set; }
  }

  /// <summary>
  /// <see href="${href(originalFile)}" internal="" />
  /// </summary>
  public partial class Widget : IWidget
  {
    /// <summary>
    /// <see href="${href(originalFile)}" internal="" />
    /// </summary>
    public global::System.Int32 RefTestWidgetId { get; set; }

    public static IWidget Create() { return new Widget(); }
  }
}

namespace Company.RefTest.PublicConstants
{
  public static class Parameters
  {
    public static class RefTestConstantDays
    {
      /// <summary>
      /// <see href="${href(originalFile)}" internal="" />
      /// </summary>
      public static System.String RefTestConstantCode { get { return "RefTestConstantDays"; } }

      /// <summary>
      /// <see href="${href(originalFile)}" internal="" />
      /// </summary>
      public static System.Int32 RefTestConstantValue { get { return 5; } }
    }
  }
}
`;

  // Оригиналы в прикладном коде: отдельные символы, Roslyn не связывает их с обёртками.
  const originalContent = `
namespace Company.RefTest.Shared
{
  partial class ModuleFunctions
  {
    public void PrefixFunctionA(int a) {}
    public void PrefixFunctionA(int a, int b) {}
    public void PrefixFunctionAB(int a) {}
  }

  partial class Widget
  {
    public int RefTestWidgetId { get; set; }
  }

  public static class Parameters
  {
    public static class RefTestConstantDays
    {
      public const string RefTestConstantCode = "RefTestConstantDays";
      public const int RefTestConstantValue = 5;
    }
  }

  public class ConstantsConsumer
  {
    public int Use() { return Parameters.RefTestConstantDays.RefTestConstantValue; }
  }
}
`;

  // Прикладные использования через сгенерированные обёртки.
  const usagesContent = `
namespace Company.RefTest.App
{
  public class Consumer
  {
    public void Use()
    {
      Company.RefTest.Functions.Module.PrefixFunctionA(1);
      Company.RefTest.Functions.Module.PrefixFunctionAB(1);
      Company.RefTest.Structures.Module.IWidget widget = Company.RefTest.Structures.Module.Widget.Create();
      var id = widget.RefTestWidgetId;
      var value = Company.RefTest.PublicConstants.Parameters.RefTestConstantDays.RefTestConstantValue;
    }
  }
}
`;

  const positionOf = async (uri: vscode.Uri, token: string): Promise<vscode.Position> => {
    const document = await vscode.workspace.openTextDocument(uri);
    const index = document.getText().indexOf(token);
    if (index < 0) throw new Error(`Token '${token}' not found in ${uri.fsPath}`);
    return document.positionAt(index);
  };

  const lineOf = async (uri: vscode.Uri, token: string): Promise<number> => {
    const position = await positionOf(uri, token);
    return position.line;
  };

  const positionOfOccurrence = async (uri: vscode.Uri, token: string, occurrence: number): Promise<vscode.Position> => {
    const document = await vscode.workspace.openTextDocument(uri);
    const text = document.getText();
    let index = -1;
    for (let i = 0; i <= occurrence; i++) {
      index = text.indexOf(token, index + 1);
      if (index < 0) throw new Error(`Occurrence ${occurrence} of '${token}' not found in ${uri.fsPath}`);
    }
    return document.positionAt(index);
  };

  const hasLocationOnLine = (locations: Array<vscode.Location>, uri: vscode.Uri, line: number): boolean =>
    locations.some((location) => location.uri.toString() === uri.toString() && location.range.start.line === line);

  const hasLocationInFile = (locations: Array<vscode.Location>, uri: vscode.Uri): boolean =>
    locations.some((location) => location.uri.toString() === uri.toString());

  // Дожидаемся, пока Roslyn проиндексирует сгенерированный файл.
  const waitForGeneratedSymbol = async (): Promise<void> => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const symbols =
        (await vscode.commands.executeCommand<Array<vscode.SymbolInformation>>(
          'vscode.executeWorkspaceSymbolProvider',
          'PrefixFunctionA',
        )) ?? [];
      if (symbols.some((symbol) => symbol.location.uri.fsPath.endsWith(generatedFile))) return;
      await delay(500);
    }
    throw new Error(`Roslyn did not index ${generatedFile}`);
  };

  // Повторяем запрос ссылок, пока провайдер не отдаст ожидаемую локацию (индексация может запаздывать).
  const referencesEventually = async (
    uri: vscode.Uri,
    position: vscode.Position,
    isReady: (locations: Array<vscode.Location>) => boolean,
  ): Promise<Array<vscode.Location>> => {
    let locations: Array<vscode.Location> = [];
    for (let attempt = 0; attempt < 20; attempt++) {
      ReferenceSearch.clearCache();
      locations =
        (await vscode.commands.executeCommand<Array<vscode.Location>>(
          'vscode.executeReferenceProvider',
          uri,
          position,
        )) ?? [];
      if (isReady(locations)) return locations;
      await delay(500);
    }
    return locations;
  };

  setup(async () => {
    await vscode.workspace.fs.writeFile(uriOf(generatedFile), Buffer.from(generatedContent));
    await vscode.workspace.fs.writeFile(uriOf(originalFile), Buffer.from(originalContent));
    await vscode.workspace.fs.writeFile(uriOf(usagesFile), Buffer.from(usagesContent));
    await waitForGeneratedSymbol();
  });

  test('function: call through the wrapper is found', async () => {
    const originalUri = uriOf(originalFile);
    const usagesUri = uriOf(usagesFile);
    const position = await positionOf(originalUri, 'PrefixFunctionA(int a)');
    const expectedLine = await lineOf(usagesUri, 'PrefixFunctionA(1)');

    const locations = await referencesEventually(originalUri, position, (found) =>
      hasLocationOnLine(found, usagesUri, expectedLine),
    );

    assert.ok(
      hasLocationOnLine(locations, usagesUri, expectedLine),
      'Expected a reference to the call through the wrapper',
    );
  });

  test('function: definition is found when invoked from a usage', async () => {
    const originalUri = uriOf(originalFile);
    const usagesUri = uriOf(usagesFile);
    const position = await positionOf(usagesUri, 'PrefixFunctionA(1)');
    const expectedLine = await lineOf(originalUri, 'PrefixFunctionA(int a)');

    const locations = await referencesEventually(usagesUri, position, (found) =>
      hasLocationOnLine(found, originalUri, expectedLine),
    );

    assert.ok(
      hasLocationOnLine(locations, originalUri, expectedLine),
      'Expected the original definition when invoked from a usage',
    );
  });

  test('function: other overload is not mixed in', async () => {
    const originalUri = uriOf(originalFile);
    const usagesUri = uriOf(usagesFile);
    const position = await positionOf(originalUri, 'PrefixFunctionA(int a, int b)');
    const declarationLine = await lineOf(originalUri, 'PrefixFunctionA(int a, int b)');
    const foreignLine = await lineOf(usagesUri, 'PrefixFunctionA(1)');

    const locations = await referencesEventually(originalUri, position, (found) =>
      hasLocationOnLine(found, originalUri, declarationLine),
    );

    assert.ok(!hasLocationOnLine(locations, usagesUri, foreignLine), 'Usages of another overload must not be mixed in');
  });

  test('function: similarly named sibling is not mixed in', async () => {
    const originalUri = uriOf(originalFile);
    const usagesUri = uriOf(usagesFile);
    const position = await positionOf(originalUri, 'PrefixFunctionA(int a)');
    const expectedLine = await lineOf(usagesUri, 'PrefixFunctionA(1)');
    const foreignLine = await lineOf(usagesUri, 'PrefixFunctionAB(1)');

    const locations = await referencesEventually(originalUri, position, (found) =>
      hasLocationOnLine(found, usagesUri, expectedLine),
    );

    assert.ok(
      !hasLocationOnLine(locations, usagesUri, foreignLine),
      'References to the similarly named sibling must not be mixed in',
    );
  });

  test('structure: usage through the wrapper is found', async () => {
    const originalUri = uriOf(originalFile);
    const usagesUri = uriOf(usagesFile);
    const position = await positionOf(originalUri, 'Widget');
    const expectedLine = await lineOf(usagesUri, 'Widget.Create()');

    const locations = await referencesEventually(originalUri, position, (found) =>
      hasLocationOnLine(found, usagesUri, expectedLine),
    );

    assert.ok(hasLocationOnLine(locations, usagesUri, expectedLine), 'Expected a reference to the structure usage');
  });

  test('structure property: usage is found', async () => {
    const originalUri = uriOf(originalFile);
    const usagesUri = uriOf(usagesFile);
    const position = await positionOf(originalUri, 'RefTestWidgetId');
    const expectedLine = await lineOf(usagesUri, 'widget.RefTestWidgetId');

    const locations = await referencesEventually(originalUri, position, (found) =>
      hasLocationOnLine(found, usagesUri, expectedLine),
    );

    assert.ok(hasLocationOnLine(locations, usagesUri, expectedLine), 'Expected a reference to the structure property');
  });

  test('constant: usage is found', async () => {
    const originalUri = uriOf(originalFile);
    const usagesUri = uriOf(usagesFile);
    const position = await positionOf(originalUri, 'RefTestConstantValue');
    const expectedLine = await lineOf(usagesUri, 'RefTestConstantValue');

    const locations = await referencesEventually(originalUri, position, (found) =>
      hasLocationOnLine(found, usagesUri, expectedLine),
    );

    assert.ok(hasLocationOnLine(locations, usagesUri, expectedLine), 'Expected a reference to the constant');
  });

  test('constant: original references are found when invoked from a usage', async () => {
    const originalUri = uriOf(originalFile);
    const usagesUri = uriOf(usagesFile);
    const position = await positionOf(usagesUri, 'RefTestConstantValue');
    const expectedLine = await lineOf(originalUri, 'RefTestConstantValue');

    const locations = await referencesEventually(usagesUri, position, (found) =>
      hasLocationOnLine(found, originalUri, expectedLine),
    );

    assert.ok(
      hasLocationOnLine(locations, originalUri, expectedLine),
      'Expected the original constant when invoked from a usage',
    );
  });

  test('constant: wrapper references are found when invoked from the original usage', async () => {
    const originalUri = uriOf(originalFile);
    const usagesUri = uriOf(usagesFile);
    const position = await positionOfOccurrence(originalUri, 'RefTestConstantValue', 1);
    const expectedLine = await lineOf(usagesUri, 'RefTestConstantValue');

    const locations = await referencesEventually(originalUri, position, (found) =>
      hasLocationOnLine(found, usagesUri, expectedLine),
    );

    assert.ok(
      hasLocationOnLine(locations, usagesUri, expectedLine),
      'Expected the wrapper usage when invoked from the original usage',
    );
  });

  test('constant: generated wrapper is included when invoked from the definition', async () => {
    const originalUri = uriOf(originalFile);
    const generatedUri = uriOf(generatedFile);
    const position = await positionOf(originalUri, 'RefTestConstantValue');

    const locations = await referencesEventually(originalUri, position, (found) =>
      hasLocationInFile(found, generatedUri),
    );

    assert.ok(hasLocationInFile(locations, generatedUri), 'Expected the generated wrapper file in the results');
  });
});
