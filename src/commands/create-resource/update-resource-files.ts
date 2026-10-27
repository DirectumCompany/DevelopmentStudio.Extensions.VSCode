import * as fs from 'fs';
import * as vscode from 'vscode';

/** Информация для добавления. */
export interface IUpdateInfo {
  /** Файл, куда добавлять значение. */
  filePath: string;
  /** Значение. */
  value: string;
}

/**
 * Изменить ресурсные файлы.
 * @param resourceKey Ключ ресурса для добавления.
 * @param updateInfos Массив с информацией для добавления.
 */
export async function updateResourceFiles(resourceKey: string, updateInfos: Array<IUpdateInfo>): Promise<void> {
  for (const updateInfo of updateInfos) {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: `Adding resource "${resourceKey}" to ${updateInfo.filePath}...`,
      },
      () => {
        addResourceToResourceFile(updateInfo.filePath, resourceKey, updateInfo.value);
        return Promise.resolve();
      },
    );
  }
}

/**
 * Добавить ресурс в ресурсный файл.
 * @param resourceFilePath Путь к ресурсному файлу.
 * @param key Ключ.
 * @param value Значение ресурса.
 */
function addResourceToResourceFile(resourceFilePath: string, key: string, value: string): void {
  if (!fs.existsSync(resourceFilePath)) {
    throw new Error(`Cannot find .resx file: ${resourceFilePath}`);
  }

  let content: string;
  try {
    content = fs.readFileSync(resourceFilePath, 'utf-8');
  } catch {
    throw new Error(`Cannot read .resx file: ${resourceFilePath}`);
  }

  const keyExists = checkKeyExists(key, content);
  if (keyExists) {
    throw new Error(`Resource key "${key}" already exists in ${resourceFilePath}`);
  }

  const newEntry = buildDataEntry(key, value);
  const rootEnd = content.lastIndexOf('</root>');
  if (rootEnd === -1) {
    throw new Error(`Invalid .resx file: missing </root> tag in ${resourceFilePath}`);
  }
  const updated = content.slice(0, rootEnd) + newEntry + content.slice(rootEnd);

  try {
    fs.writeFileSync(resourceFilePath, updated, 'utf-8');
  } catch {
    throw new Error(`Cannot write to .resx file: ${resourceFilePath}`);
  }
}

/**
 * Проверить существует ли ресурс с заданным ключом в ресурсном файле.
 * @param key Ключ.
 * @param content Содержимое ресурсного файла.
 * @returns Признак наличия ключа в файле.
 */
function checkKeyExists(key: string, content: string): boolean {
  const regex = /<data\s+name="([^"]*)"\s*xml:space="preserve">/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.length > 1 && match[1] === key) return true;
  }
  return false;
}

/**
 * Сформировать строку для добавления в ресурсный файл.
 * @param key Ключ ресурса.
 * @param value Значение ресурса.
 * @returns Строка с элементом data для ресурсного файла.
 */
function buildDataEntry(key: string, value: string): string {
  const escapedValue = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  return `  <data name="${key}" xml:space="preserve">
    <value>${escapedValue}</value>
  </data>
`;
}
