import * as path from 'path';
import { pluralize } from '../utils/utils';

/** Данные, извлеченные из пути файла прикладной разработки. */
export interface IParsedFilePath {
  /** Признак перекрытия для модулей. */
  isLayer: boolean;
  /** Признак изолированной области. */
  isIsolatedArea: boolean;
  /** Признак отчета. */
  isReport: boolean;
  /** Имя модуля. */
  moduleName: string;
  /** Код компании. */
  companyName: string;
  /** Имя сущности. */
  entityName: string;
  /** Имя решения. */
  solutionName: string;
  /** Исходный путь, который разбирали. */
  sourcePath: string;
}

/** Имя папки для отчетов. */
export const REPORTS_SUBDIRECTORY_NAME = 'Reports';

/**
 * Разобрать путь до файла прикладной разработки.
 * @param filePath Абсолютный путь до файла.
 * @returns Возвращается объект {@linkcode IParsedFilePath} или null если разобрать не удалось.
 */
export function getParsedFilePath(filePath: string): IParsedFilePath | null {
  const separator = path.sep;
  const pattern = `(?<company>\\w+)\\.(?<module>\\w+)\\${separator}((VersionData\\${separator}.*$)|(\\k<company>\\.\\k<module>\\.((Libraries\\${separator}.*$)|((Client|ClientBase|Shared|Server)\\${separator}(((?<report>Reports)\\${separator})?((\\w+\\.((?<layeredModule>\\w+)\\${separator}.*$)|(((Icons|DesktopViews|Queries)\\${separator}.*$|((?<entity>\\w+)(@|\\${separator}).*$)))))|(\\w+\\.\\w+.*$)))|(Settings\\${separator}((?<noCodeSettingsType>\\w+)\\${separator})?.*$))))`;
  const regex = new RegExp(pattern);
  let match = filePath.match(regex);

  let isIsolatedArea = false;

  if (!match?.groups) {
    const isolatedAreaPattern = `(?<company>\\w+)\\.(?<module>\\w+)\\${separator}\\k<company>\\.\\k<module>\\.Isolated\\${separator}(IsolatedAreas|((\\w+\\.((?<layeredModule>\\w+))))\\${separator}IsolatedAreas)\\${separator}((?<entity>\\w+)(\\${separator}).*$)`;
    const isolatedAreaRegex = new RegExp(isolatedAreaPattern);
    match = filePath.match(isolatedAreaRegex);
    isIsolatedArea = !!match;
  }

  if (match?.groups) {
    const layeredModule = match.groups.layeredModule;
    const isLayer = !!layeredModule;
    const moduleName = isLayer ? layeredModule : match.groups.module;
    const solutionName = isLayer ? match.groups.module : '';
    return {
      isLayer,
      isIsolatedArea,
      isReport: !!match.groups.report,
      moduleName,
      companyName: match.groups.company,
      entityName: match.groups.entity,
      solutionName,
      sourcePath: filePath,
    };
  }
  return null;
}

/**
 * Получить полное имя ресурса.
 * @param parsedFilePath Данные, извлеченные из пути файла прикладной разработки.
 * @param key Ключ ресурса.
 * @returns Полное имя ресурса.
 */
export function getFullQualifiedName(parsedFilePath: IParsedFilePath, key: string): string {
  const companyCode = parsedFilePath.companyName;
  const moduleName = parsedFilePath.moduleName;
  const entityName = parsedFilePath.entityName;

  if (parsedFilePath.isLayer) {
    return `${companyCode}.${parsedFilePath.solutionName}.Module.${moduleName}.Resources.${key}`;
  }

  if (parsedFilePath.isReport && entityName) {
    return `${companyCode}.${moduleName}.${REPORTS_SUBDIRECTORY_NAME}.Resources.${entityName}.${key}`;
  }

  if (!parsedFilePath.isIsolatedArea && entityName) {
    const pluralName = pluralize(entityName);
    return `${companyCode}.${moduleName}.${pluralName}.Resources.${key}`;
  }
  // TODO Проблема с изолированными областями: после замены на путь до ресурса сборка не проходит, хотя строка формируется такаяже, что и в старом DDS.
  // Разбираться надо не здесь, так как в старом DDS тоже сборка не проходит при создании ресурса из строковой константы.
  return `${companyCode}.${moduleName}.Resources.${key}`;
}
