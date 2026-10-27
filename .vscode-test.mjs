/** @import { TestConfiguration } from '@vscode/test-cli' */
import { defineConfig } from '@vscode/test-cli';

export default defineConfig(createVersionConfigs('ms-dotnettools', 'csharp'));

/**
 * @param {string} publisher
 * @param {string} extension
 * @returns {TestConfiguration[]}
 */
export function createVersionConfigs(publisher, extension) {
  return {
    label: 'test-profile',
    files: 'src/tests/**/*.test.ts',
    workspaceFolder: './src/tests/workspace',
    installExtensions: [`${publisher}.${extension}`],
    env: {
      DEP_NAME: `${publisher}.${extension}`,
      DEP_VERSION: '',
    },
    // Профиль не задаётся специально: с ним установленное через installExtensions расширение не видно
    // в окне теста. К аргументу --disable-workspace-trust это не относится.
    launchArgs: ['--disable-workspace-trust'],
    mocha: {
      ui: 'tdd',
      require: ['tsx/cjs'],
    },
  };
}
