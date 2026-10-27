import * as path from 'path';
import * as fs from 'fs';
import { IParsedFilePath, REPORTS_SUBDIRECTORY_NAME } from './parsed-file-path';

/** Язык по умолчанию. */
const DEFAULT_LANGUAGE = 'en';

/** Список доступных языков. */
const AVAILABLE_LANGUAGES = ['ru', DEFAULT_LANGUAGE] as const;

/** Ключи языков. */
type LanguageKeys = (typeof AVAILABLE_LANGUAGES)[number];

/** Словарь, где ключ - язык локализации, значение - путь до ресурсного файла. */
type ResourceFiles = Partial<Record<LanguageKeys, string>>;

/**
 * Получить объект, где ключ - язык локализации, значение - путь до ресурсного файла.
 * @param parsedFilePath Данные, извлеченные из пути файла прикладной разработки.
 * @returns Возвращается {@linkcode ResourceFiles информацию по расположению} или null.
 */
export function getResourceFiles(parsedFilePath: IParsedFilePath): Promise<ResourceFiles | null> {
  const resourceDir = getResourceDir(parsedFilePath);
  if (!resourceDir || !fs.existsSync(resourceDir)) return Promise.resolve(null);

  const filePaths: ResourceFiles = {};
  const resourceFileName =
    !!parsedFilePath.entityName && !parsedFilePath.isIsolatedArea ? parsedFilePath.entityName : 'Module';
  AVAILABLE_LANGUAGES.forEach((language) => {
    const fullPath = path.join(resourceDir, getResourceFileName(resourceFileName, language));
    filePaths[language] = fullPath;
  });
  return Promise.resolve(filePaths);
}

/**
 * Вернуть папку, где расположены resx-файлы.
 * @param parsedFilePath Данные, извлеченные из пути файла прикладной разработки.
 * @returns Папка с resx-файлами или null.
 */
function getResourceDir(parsedFilePath: IParsedFilePath): string | null {
  const sharedProjectDir = findSharedProjectDir(parsedFilePath.sourcePath);
  if (!sharedProjectDir) return null;

  switch (true) {
    case parsedFilePath.isLayer:
      return path.join(sharedProjectDir, `${parsedFilePath.companyName}.${parsedFilePath.moduleName}`);
    case parsedFilePath.isReport:
      return path.join(sharedProjectDir, REPORTS_SUBDIRECTORY_NAME, parsedFilePath.entityName);
    case !!parsedFilePath.entityName && !parsedFilePath.isIsolatedArea:
      return path.join(sharedProjectDir, parsedFilePath.entityName);
    default:
      // TODO Проблема с изолированными областями: добавляется строка туда же, что и в старом DDS, но сборка не проходит.
      // Разбираться надо не здесь, так как в старом DDS тоже сборка не проходит при создании ресурса из строковой константы.
      return sharedProjectDir;
  }
}

/**
 * Найти Shared-папку.
 * @param filePath Путь, с которого начинаем поиск.
 * @returns Путь до Shared-папки или null.
 */
function findSharedProjectDir(filePath: string): string | null {
  let dir = path.dirname(filePath);
  let parent = path.dirname(dir);
  while (parent !== dir) {
    const siblings = fs.readdirSync(parent);
    const sharedDir = siblings.find((s) => s.endsWith('.Shared'));
    if (sharedDir) {
      const fullPath = path.join(parent, sharedDir);
      if (fs.statSync(fullPath).isDirectory()) {
        return fullPath;
      }
    }
    dir = parent;
    parent = path.dirname(dir);
  }
  return null;
}

/**
 * Получить имя файла ресурсов.
 * @param fileName Имя файла.
 * @param language Язык ресурсов.
 * @returns Имя файла ресурсов для указанного языка.
 */
function getResourceFileName(fileName: string, language: string): string {
  return language === DEFAULT_LANGUAGE ? `${fileName}.resx` : `${fileName}.${language}.resx`;
}
