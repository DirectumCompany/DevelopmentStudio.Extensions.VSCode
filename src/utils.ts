import * as vscode from 'vscode';

/**
 * Является ли файл сгенерированной обёрткой (`*.g.cs`).
 * @param uri Uri документа.
 * @returns true - если файл сгенерирован платформой.
 */
export const isWrapperFile = (uri: vscode.Uri): boolean => uri.fsPath.endsWith('.g.cs');

/**
 * Вернуть количество символов из {@linkcode vscode.DocumentSymbol.selectionRange selectionRange}.
 * @param container Контейнер.
 * @returns Количество символов.
 */
const getCharacterCount = (container: vscode.DocumentSymbol): number => {
  const selectionRange = container.selectionRange;
  return selectionRange.end.character - selectionRange.start.character;
};

/**
 * Вернуть только имя без параметров и возвращаемого значения.
 * @param container Контейнер.
 * @returns Строка только с именем, без параметров и возвращаемого значения.
 */
export function getOnlyName(container: vscode.DocumentSymbol): string {
  return container.name.substring(0, getCharacterCount(container));
}

/** Псевдонимы типов. */
const TYPE_ALIASES: Record<string, string> = {
  Boolean: 'bool',
  UInt64: 'ulong',
  Int64: 'long',
  UInt32: 'uint',
  Int32: 'int',
  UInt16: 'ushort',
  Int16: 'short',
  UIntPtr: 'nuint',
  IntPtr: 'nint',
  Single: 'float',
};

/**
 * Вернуть описание с замененными на алиасы предопределенными типами.
 * @param container Контейнер.
 * @returns Описание с замененными на алиасы предопределенными типами.
 */
export const getDescriptionWithTypeAliases = (container: vscode.DocumentSymbol): string => {
  const replacePredefinedTypes = (value: string): string => {
    let tail = value;
    const replacementSteps: Array<[RegExp, (substring: string, ...args: Array<string>) => string]> = [
      [
        /(Object|Enum|MulticastDelegate|Delegate|ValueType|Void|Char|S?Byte|Decimal|Double|String|IntPtr)\b/g,
        (match): string => match[0].toLowerCase() + match.slice(1),
      ],
      [/(Boolean|U?Int(64|32|16)+|U?IntPtr|Single)\b/g, (match): string => TYPE_ALIASES[`${match}`]],
      [/Nullable<(\w+)>/g, (_match, type): string => `${type}?`],
    ];
    for (const [searchValue, replacement] of replacementSteps) tail = tail.replaceAll(searchValue, replacement);
    return tail;
  };

  const description = container.detail;
  const characterCount = getCharacterCount(container);
  const nameDescription = description.substring(0, characterCount);
  const tailDescription = description.substring(characterCount);

  const aliasedTypesTail = replacePredefinedTypes(tailDescription);
  return nameDescription.concat(aliasedTypesTail);
};
