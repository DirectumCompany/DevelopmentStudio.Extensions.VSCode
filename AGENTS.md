# Development Studio для VS Code — AGENTS.md

Правила проекта расширения VS Code «Development Studio». Надстройка над штатным C#-расширением
(`ms-dotnettools.csharp`), которая дополняет навигацию по прикладному коду решений на платформе Sungero.

## Контекст

Расширение помогает разработчикам решений Sungero работать с прикладным кодом, а не со сгенерированными
платформой обёртками. Возможности:

- переход к «оригиналам» вместо обёрток (Go to Definition): Public/Remote функции, структуры и их свойства,
  строки ресурсов (`.resx`), запросы к БД (`.sql`);
- поиск ссылок (Find All References, `Shift+F12`) для функций, структур и констант модулей: штатный Roslyn
  не связывает оригинал с обёрткой, расширение добавляет места использования через обёртку;
- счётчик ссылок (CodeLens «N references») над объявлениями: заменяет штатную линзу C#-расширения и
  учитывает места использования через обёртки;
- команды `sungero.opensInPeek` (просмотр ресурсов/запросов символа, `Ctrl+Alt+R`) и
  `sungero.createResourceFromText` (добавление строковой константы в ресурсы, `Ctrl+Alt+N`);
- настройки `sungero.resourseLanguageDefault` (язык ресурсов, `en`/`ru`) и `sungero.queryTypeDefault`
  (тип запроса, `postgres`/`mssql`).

Общее:

- точка входа `./dist/extension.js`;
- обязательная зависимость `ms-dotnettools.csharp` (Roslyn);
- активация по `workspaceContains:**/*.csproj` и `onLanguage:csharp`;
- минимальная версия VS Code — `^1.89.1` (см. `README.md`); Node.js/npm — см. `CONTRIBUTING.md`.

## Структура `src/`

| Файл / каталог              | Назначение                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `extension.ts`              | Активация: дожидается активации и готовности C#-расширения (Roslyn), затем регистрирует провайдеры определения, ссылок и CodeLens                                 |
| `definition-provider.ts`    | `AdditionalDefinitionProvider` — дополняет Go to Definition переходами от обёртки к оригиналу                            |
| `reference-provider.ts`     | `AdditionalReferenceProvider` — дополняет Find All References переходами от оригинала к обёрткам                             |
| `reference-search.ts`       | `ReferenceSearch` — сбор ссылок по обёрткам, фильтрация `*.g.cs`, дедуп, кэш                                       |
| `code-lens-provider.ts`     | `AdditionalCodeLensProvider` — линза «N references» над объявлениями: счёт объединённых ссылок через `ReferenceSearch`, кэш и пересчёт |
| `wrapper-locator.ts`        | `WrapperLocator` — поиск обёрток в `*.g.cs` по имени и href, определение символа под курсором                            |
| `symbol-loader.ts`          | `DocumentSymbolLoader` — по определению в `*.g.cs` читает href-комментарий и загружает описание обёртки                  |
| `constructs/`               | Модели конструкций: `ProgrammingConstruct` (функции, свойства/структуры/константы), `Resources`, `Queries`               |
| `searchers/`                | Поиск оригиналов: база `SymbolSearcher`, `SymbolSearcherByHrefComment`, `SearcherResourcesOrQueries`                     |
| `commands/open-in-peek/`    | Команда показа ресурсов/запросов символа                                                                                 |
| `commands/create-resource/` | Команда добавления строковой константы в ресурсы (вебвью-форма)                                                          |
| `settings.ts`               | Работа с настройками и диалог обновления                                                                                 |
| `vscode-api.ts`             | Тонкие обёртки над `vscode.commands.executeCommand` (definition, references, workspace symbols, symbols, showReferences) |
| `types.ts`                  | Общие типы (`ElementDetail`, `NameAndDetail`, `InfoFromComment`) и фабрика `createWrapperConstruct`                      |
| `utils.ts`                  | Утилиты нормализации имён и типов                                                                                        |
| `tests/`                    | Тесты и тестовый воркспейс                                                                                               |

## Ключевая доменная модель

- Прикладной код (функции, структуры и их свойства, строки ресурсов, запросы) пишет разработчик, а платформа
  при сохранении генерирует для него код-обёртки в `*.g.cs`.
- Связь оригинала с обёрткой — href-комментарий вида `<see href="file:///...">`; рядом может стоять
  `<redirect ...>`. Это единственный контракт, на который опирается расширение.
- Roslyn считает оригинал и обёртку разными символами, поэтому штатные Go to Definition и Find All References
  не связывают их; расширение добавляет свои провайдеры, работающие в обе стороны.

## Переход к оригиналу (Go to Definition)

1. `AdditionalDefinitionProvider` вызывает `vscode.executeDefinitionProvider`.
2. Для каждого определения в `*.g.cs` `DocumentSymbolLoader` читает href-комментарий и находит символ обёртки.
3. По символу обёртки создаётся конструкция (`createWrapperConstruct` → `Resources` / `ProgrammingConstruct` /
   `Queries`).
4. Конструкция ищет в файле-оригинале (из href) соответствующий символ (`SymbolSearcherByHrefComment`) и
   возвращает его как дополнительное определение.

## Поиск ссылок (Find All References)

1. `AdditionalReferenceProvider` работает только из «оригинального» файла (не `*.g.cs`).
2. `WrapperLocator.findSymbolAtPosition` находит символ под курсором; `getWrapperNameVariants` даёт имя и его
   `I`-вариант (для структур), `getContainerTypeNameVariants` — имя типа-контейнера (для членов).
3. `WrapperLocator.findWrapperLocations` ищет обёртки через `executeWorkspaceSymbolProvider`, оставляет только
   `*.g.cs`, сверяет href на файл-оригинал и тип-контейнер.
4. `ReferenceSearch.findReferencesThroughWrappers` параллельно запрашивает ссылки Roslyn по обёрткам,
   отбрасывает результаты в `*.g.cs`, убирает дубликаты и кэширует результат (TTL 15 c, сброс по сохранению
   документа; пустой результат не кэшируется).

Результаты объединяются со штатными результатами C#-провайдера.

## Линза ссылок (CodeLens)

- `AdditionalCodeLensProvider` показывает над объявлениями (функции, структуры, константы) счётчик
  «N references», который считает объединённый результат — прямые ссылки Roslyn плюс места использования
  через обёртки (`ReferenceSearch`).
- Расчёт отложен (первое число появляется с задержкой), кэшируется и обновляет значение только при изменении
  набора ссылок; пересчёт запускается по сохранению и закрытию документа, а также периодически для видимых
  редакторов.
- Штатная линза «N references» C#-расширения отключается через `configurationDefaults`
  (`dotnet.codeLens.enableReferencesCodeLens: false`), чтобы не было двух счётчиков.

## Документация

- `README.md` — возможности, горячие клавиши, требования.
- `CONTRIBUTING.md` — пререквизиты, сборка, пакет vsix, установка.
- `CHANGELOG.md` — история версий.
- `package.json` → `contributes` — команды, клавиши, настройки, `configurationDefaults` (отключение штатной линзы ссылок).

## Сборка и запуск

- `npm i` — установка зависимостей.
- `npm run compile` — сборка webpack в `dist/extension.js` (development).
- `npm run watch` — первичная сборка и далее `tsc --watch --preserveWatchOutput`.
- `npm run package` / `package.bat [версия]` — production-сборка и пакет vsix; с версией — ещё коммит и тег `v<версия>`.
- Запуск расширения — F5 (сборка выполняется как `preLaunchTask`). И F5, и тесты грузят `dist/extension.js`,
  поэтому перед запуском/тестами нужна свежая сборка `npm run compile`.

## Тестирование

Фреймворк — `vscode-test` (`@vscode/test-cli`) + mocha (UI `tdd`), конфиг `.vscode-test.mjs`, тестовый
воркспейс `src/tests/workspace` (C#-проект и файлы); при запуске автоматически ставится `ms-dotnettools.csharp`.

Существующие тесты:

- `src/tests/suite/wrapper-locator.test.ts` — юнит-тесты чистых правил `WrapperLocator` (нормализация путей,
  сопоставление имён, href, определение типа-контейнера); без Roslyn;
- `src/tests/suite/reference-provider.test.ts` — интеграционные: в `setup()` пишет фикстуры (`RefTest.g.cs`,
  `RefTestOriginal.cs`, `RefTestUsages.cs`) и проверяет ссылки через `vscode.executeReferenceProvider`
  (ожидает индексацию Roslyn, таймаут сьюта увеличен);
- `src/tests/suite/definition-provider.test.ts` — интеграционные: проверяет дополнительные определения через
  `vscode.executeDefinitionProvider`;
- `src/tests/suite/code-lens-provider.test.ts` — юнит-тесты состояния линзы «N references» (текст, отложенный
  расчёт, кэш, событие, dispose, устаревшая позиция) на подменённых зависимостях; без Roslyn;
- `src/tests/suite/extension.test.ts` — проверка активации расширения.

Запуск:

- `npx vscode-test` — все тесты;
- `npx vscode-test --run src/tests/suite/<файл>.test.ts` — один файл;
- `npx vscode-test --grep "<подстрока>"` — фильтр по названиям тестов.

тесты удобнее гонять через `npx vscode-test` напрямую. Перед прогоном — `npm run compile`.
