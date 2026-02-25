import * as assert from 'assert';
import * as vscode from 'vscode';

suite('AdditionalDefinitionProvider', () => {
  // eslint-disable-next-line @typescript-eslint/no-base-to-string, @typescript-eslint/restrict-template-expressions
  const locationToString = (loc: vscode.Location): string => `${loc.range}#'${loc.uri}'`;
  const workspace = vscode.workspace.workspaceFolders![0];
  const moduleGCsUri = vscode.Uri.joinPath(workspace.uri, 'Module.g.cs');
  const moduleClientFunctionsUri = vscode.Uri.joinPath(workspace.uri, 'ModuleClientFunctions.cs');

  setup(async () => {
    await vscode.workspace.fs.writeFile(
      moduleGCsUri,
      Buffer.from(`
        namespace Company.Solution1.Functions
        {
          internal static partial class Module
          {
            /// <summary>
            /// <see href="file:///${workspace.uri.path}/ModuleSharedFunctions.cs" internal="" />
            /// </summary>
            internal static void SharedFunction(global::System.Int32 a, global::System.String b) {}
          }
        }

        namespace Company.Solution1
        {
          public class Resources
          {
            public static global::CommonLibrary.LocalizedString ResValue => default;

            public static global::CommonLibrary.LocalizedString ResValueFormat(params object[] args) => default;
          }
        }

        namespace Company.Module1.Queries
        {
          public class Module
          {
            public static string SomeQuery => default;
          }
        }
        
        namespace CommonLibrary { public readonly struct LocalizedString(); }
      `),
    );
  });

  test('function has additional definition from link', async () => {
    const result = await vscode.commands.executeCommand<Array<vscode.Location>>(
      'vscode.executeDefinitionProvider',
      moduleClientFunctionsUri,
      new vscode.Position(6, 49),
    );

    const expected = [
      new vscode.Location(moduleGCsUri, new vscode.Range(8, 33, 8, 47)),
      new vscode.Location(
        vscode.Uri.joinPath(workspace.uri, 'ModuleSharedFunctions.cs'),
        new vscode.Range(4, 16, 4, 30),
      ),
    ];

    assert.deepStrictEqual(result.map(locationToString), expected.map(locationToString));
  });

  test('resource property has additional definition from resx', async () => {
    const result = await vscode.commands.executeCommand<Array<vscode.Location>>(
      'vscode.executeDefinitionProvider',
      moduleClientFunctionsUri,
      new vscode.Position(7, 43),
    );

    const expected = [
      new vscode.Location(moduleGCsUri, new vscode.Range(16, 64, 16, 72)),
      new vscode.Location(vscode.Uri.joinPath(workspace.uri, 'Module.resx'), new vscode.Range(60, 14, 60, 22)),
    ];

    assert.deepStrictEqual(result.map(locationToString), expected.map(locationToString));
  });

  test('query property has additional definition from sql', async () => {
    const result = await vscode.commands.executeCommand<Array<vscode.Location>>(
      'vscode.executeDefinitionProvider',
      moduleClientFunctionsUri,
      new vscode.Position(8, 46),
    );

    const expected = [
      new vscode.Location(moduleGCsUri, new vscode.Range(26, 33, 26, 42)),
      new vscode.Location(vscode.Uri.joinPath(workspace.uri, 'Queries/SomeQuery.sql'), new vscode.Range(0, 0, 0, 0)),
    ];

    assert.deepStrictEqual(result.map(locationToString), expected.map(locationToString));
  });
});
