/* eslint-disable jsdoc/require-jsdoc */
import * as assert from 'assert';
import * as vscode from 'vscode';

import { WrapperLocator } from '../../wrapper-locator';

// Приватные методы WrapperLocator, проверяемые напрямую.
interface WrapperLocatorInternals {
  isWrapperNameMatch(candidate: string, search: string): boolean;
  isIdentifierChar(char: string): boolean;
  isReferenceableSymbolKind(kind: vscode.SymbolKind): boolean;
  findOriginalHrefAbove(documentLines: Array<string>, from: number): string | undefined;
  findOriginalHrefBelow(documentLines: Array<string>, from: number): string | undefined;
  hasOriginalHrefNear(documentLines: Array<string>, range: vscode.Range, originalPath: string): boolean;
  getEnclosingTypeName(documentLines: Array<string>, line: number): string | undefined;
  hasExpectedContainerType(documentLines: Array<string>, range: vscode.Range, parentNames: Array<string>): boolean;
}

const internals = WrapperLocator as unknown as WrapperLocatorInternals;

// Символ документа с минимально нужными для теста полями.
const makeSymbol = (name: string, kind: vscode.SymbolKind): vscode.DocumentSymbol =>
  new vscode.DocumentSymbol(name, '', kind, new vscode.Range(0, 0, 0, 0), new vscode.Range(0, 0, 0, 0));

// Диапазон, начинающийся в указанной строке.
const rangeAtLine = (line: number): vscode.Range => new vscode.Range(line, 0, line, 0);

// Строка href-комментария как в сгенерированных файлах.
const hrefLine = (path: string): string => `/// <see href="file:///${path}" internal="" />`;

suite('WrapperLocator', () => {
  suite('normalizePath', () => {
    test('removes the file:/// prefix and lowercases', () => {
      assert.strictEqual(
        WrapperLocator.normalizeFilePath('file:///D:/Projects/EE/Module.cs'),
        'd:\\projects\\ee\\module.cs',
      );
    });

    test('converts forward slashes to backslashes', () => {
      assert.strictEqual(WrapperLocator.normalizeFilePath('D:/a/b/c.cs'), 'd:\\a\\b\\c.cs');
    });

    test('removes the leading slash before the drive letter', () => {
      assert.strictEqual(WrapperLocator.normalizeFilePath('/D:/a/b.cs'), 'd:\\a\\b.cs');
    });

    test('href and fsPath normalize to the same value', () => {
      assert.strictEqual(
        WrapperLocator.normalizeFilePath('file:///D:/Projects/EE/Module.cs'),
        WrapperLocator.normalizeFilePath('d:\\projects\\ee\\module.cs'),
      );
    });
  });

  suite('getSymbolShortName', () => {
    test('strips the signature', () => {
      assert.strictEqual(WrapperLocator.getSymbolShortName('Foo(int, string)'), 'Foo');
    });

    test('keeps a name that has no signature', () => {
      assert.strictEqual(WrapperLocator.getSymbolShortName('Foo'), 'Foo');
    });

    test('trims spaces before the parenthesis', () => {
      assert.strictEqual(WrapperLocator.getSymbolShortName('Foo (int)'), 'Foo');
    });

    test('strips the type suffix that DocumentSymbol adds to members', () => {
      assert.strictEqual(WrapperLocator.getSymbolShortName('WidgetId : int'), 'WidgetId');
    });

    test('strips both signature and return type', () => {
      assert.strictEqual(WrapperLocator.getSymbolShortName('Foo(int) : void'), 'Foo');
    });
  });

  suite('getWrapperNameVariants', () => {
    test('method returns only the name', () => {
      assert.deepStrictEqual(WrapperLocator.getWrapperNameVariants(makeSymbol('Foo(int)', vscode.SymbolKind.Method)), [
        'Foo',
      ]);
    });

    test('class returns the name and the I-prefixed variant', () => {
      assert.deepStrictEqual(WrapperLocator.getWrapperNameVariants(makeSymbol('Widget', vscode.SymbolKind.Class)), [
        'Widget',
        'IWidget',
      ]);
    });

    test('interface returns both the I-prefixed and the bare name', () => {
      assert.deepStrictEqual(
        WrapperLocator.getWrapperNameVariants(makeSymbol('IWidget', vscode.SymbolKind.Interface)),
        ['IWidget', 'Widget'],
      );
    });

    test('property returns only the name', () => {
      assert.deepStrictEqual(WrapperLocator.getWrapperNameVariants(makeSymbol('Id', vscode.SymbolKind.Property)), [
        'Id',
      ]);
    });

    test('a single-letter I name does not produce an empty variant', () => {
      assert.deepStrictEqual(WrapperLocator.getWrapperNameVariants(makeSymbol('I', vscode.SymbolKind.Class)), ['I']);
    });
  });

  suite('getContainerTypeNameVariants', () => {
    test('method does not require the container check', () => {
      assert.deepStrictEqual(
        WrapperLocator.getContainerTypeNameVariants(makeSymbol('Foo', vscode.SymbolKind.Method), 'Module'),
        [],
      );
    });

    test('type does not require the container check', () => {
      assert.deepStrictEqual(
        WrapperLocator.getContainerTypeNameVariants(makeSymbol('Widget', vscode.SymbolKind.Class), 'Module'),
        [],
      );
    });

    test('member returns the container name and the I-prefixed variant', () => {
      assert.deepStrictEqual(
        WrapperLocator.getContainerTypeNameVariants(makeSymbol('Id', vscode.SymbolKind.Property), 'Widget'),
        ['Widget', 'IWidget'],
      );
    });

    test('member inside an I-interface returns both variants', () => {
      assert.deepStrictEqual(
        WrapperLocator.getContainerTypeNameVariants(makeSymbol('Id', vscode.SymbolKind.Property), 'IWidget'),
        ['IWidget', 'Widget'],
      );
    });

    test('no parent name returns an empty list', () => {
      assert.deepStrictEqual(
        WrapperLocator.getContainerTypeNameVariants(makeSymbol('Id', vscode.SymbolKind.Property), ''),
        [],
      );
    });
  });

  suite('isWrapperNameMatch', () => {
    test('exact match', () => {
      assert.strictEqual(internals.isWrapperNameMatch('Widget', 'Widget'), true);
    });

    test('qualified name', () => {
      assert.strictEqual(internals.isWrapperNameMatch('Company.Functions.Widget', 'Widget'), true);
    });

    test('signature is allowed', () => {
      assert.strictEqual(internals.isWrapperNameMatch('Foo(int)', 'Foo'), true);
    });

    test('prefix match is rejected', () => {
      assert.strictEqual(internals.isWrapperNameMatch('WidgetExtra', 'Widget'), false);
    });

    test('I-prefixed name does not match the bare name', () => {
      assert.strictEqual(internals.isWrapperNameMatch('IWidget', 'Widget'), false);
    });

    test('different name', () => {
      assert.strictEqual(internals.isWrapperNameMatch('Foo', 'Bar'), false);
    });
  });

  suite('isIdentifierChar', () => {
    test('letter, digit and underscore are identifier chars', () => {
      assert.strictEqual(internals.isIdentifierChar('a'), true);
      assert.strictEqual(internals.isIdentifierChar('5'), true);
      assert.strictEqual(internals.isIdentifierChar('_'), true);
    });

    test('dot and empty string are not identifier chars', () => {
      assert.strictEqual(internals.isIdentifierChar('.'), false);
      assert.strictEqual(internals.isIdentifierChar(''), false);
    });
  });

  suite('isReferenceableSymbolKind', () => {
    test('supported kinds', () => {
      assert.strictEqual(internals.isReferenceableSymbolKind(vscode.SymbolKind.Method), true);
      assert.strictEqual(internals.isReferenceableSymbolKind(vscode.SymbolKind.Class), true);
      assert.strictEqual(internals.isReferenceableSymbolKind(vscode.SymbolKind.Interface), true);
      assert.strictEqual(internals.isReferenceableSymbolKind(vscode.SymbolKind.Struct), true);
      assert.strictEqual(internals.isReferenceableSymbolKind(vscode.SymbolKind.Property), true);
      assert.strictEqual(internals.isReferenceableSymbolKind(vscode.SymbolKind.Field), true);
      assert.strictEqual(internals.isReferenceableSymbolKind(vscode.SymbolKind.Constant), true);
    });

    test('unsupported kinds', () => {
      assert.strictEqual(internals.isReferenceableSymbolKind(vscode.SymbolKind.Namespace), false);
      assert.strictEqual(internals.isReferenceableSymbolKind(vscode.SymbolKind.Variable), false);
    });
  });

  suite('findOriginalHrefAbove / findOriginalHrefBelow', () => {
    test('finds href above', () => {
      const lines = ['code', '/// <summary>', hrefLine('D:/a/b.cs'), '/// </summary>', 'void Foo()'];
      assert.strictEqual(internals.findOriginalHrefAbove(lines, 3), 'D:/a/b.cs');
    });

    test('does not exceed the upward search window', () => {
      const lines = [hrefLine('D:/a/b.cs'), ...new Array<string>(10).fill(''), 'void Foo()'];
      assert.strictEqual(internals.findOriginalHrefAbove(lines, 11), undefined);
    });

    test('finds href below', () => {
      const lines = ['class C', '{', hrefLine('D:/a/b.cs')];
      assert.strictEqual(internals.findOriginalHrefBelow(lines, 0), 'D:/a/b.cs');
    });

    test('does not exceed the downward search window', () => {
      const lines = ['class C', ...new Array<string>(9).fill(''), hrefLine('D:/a/b.cs')];
      assert.strictEqual(internals.findOriginalHrefBelow(lines, 1), undefined);
    });
  });

  suite('hasOriginalHrefNear', () => {
    test('href above points to the original file', () => {
      const lines = [hrefLine('D:/a/b.cs'), 'void Foo()'];
      assert.strictEqual(internals.hasOriginalHrefNear(lines, rangeAtLine(1), 'd:\\a\\b.cs'), true);
    });

    test('href above points to another file', () => {
      const lines = [hrefLine('D:/other.cs'), 'void Foo()'];
      assert.strictEqual(internals.hasOriginalHrefNear(lines, rangeAtLine(1), 'd:\\a\\b.cs'), false);
    });

    test('href below - constant class case', () => {
      const lines = ['class C', '{', hrefLine('D:/a/b.cs')];
      assert.strictEqual(internals.hasOriginalHrefNear(lines, rangeAtLine(0), 'd:\\a\\b.cs'), true);
    });

    test('no href', () => {
      const lines = ['class C', '{', '}'];
      assert.strictEqual(internals.hasOriginalHrefNear(lines, rangeAtLine(0), 'd:\\a\\b.cs'), false);
    });

    test('a foreign href above does not fall back to the one below', () => {
      const lines = [hrefLine('D:/other.cs'), 'class C', '{', hrefLine('D:/a/b.cs')];
      assert.strictEqual(internals.hasOriginalHrefNear(lines, rangeAtLine(1), 'd:\\a\\b.cs'), false);
    });
  });

  suite('getEnclosingTypeName', () => {
    test('class with an attribute and modifiers', () => {
      const lines = ['[Attr]', 'public static partial class Widget', '{'];
      assert.strictEqual(internals.getEnclosingTypeName(lines, 2), 'Widget');
    });

    test('interface', () => {
      assert.strictEqual(internals.getEnclosingTypeName(['public interface IWidget', '{'], 1), 'IWidget');
    });

    test('struct', () => {
      assert.strictEqual(internals.getEnclosingTypeName(['public struct Point', '{'], 1), 'Point');
    });

    test('the nearest declaration above wins', () => {
      const lines = ['class Outer', '{', 'class Inner', '{', 'int Id { get; set; }'];
      assert.strictEqual(internals.getEnclosingTypeName(lines, 4), 'Inner');
    });

    test('no type declaration', () => {
      assert.strictEqual(internals.getEnclosingTypeName(['namespace X', '{'], 1), undefined);
    });
  });

  suite('hasExpectedContainerType', () => {
    test('no expected types passes', () => {
      assert.strictEqual(internals.hasExpectedContainerType([], rangeAtLine(0), []), true);
    });

    test('container matches the expected one', () => {
      const lines = ['class Widget', '{', 'int Id;'];
      assert.strictEqual(internals.hasExpectedContainerType(lines, rangeAtLine(2), ['Widget', 'IWidget']), true);
    });

    test('a foreign container is rejected', () => {
      const lines = ['class Other', '{', 'int Id;'];
      assert.strictEqual(internals.hasExpectedContainerType(lines, rangeAtLine(2), ['Widget', 'IWidget']), false);
    });

    test('an unknown container is not rejected', () => {
      const lines = ['int Id;'];
      assert.strictEqual(internals.hasExpectedContainerType(lines, rangeAtLine(0), ['Widget']), true);
    });
  });
});
