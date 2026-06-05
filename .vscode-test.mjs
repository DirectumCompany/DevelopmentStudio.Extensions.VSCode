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
    launchArgs: ['--headless', '--disable-workspace-trust', '--disable-extension-updates', '--profile=test-profile'],
    mocha: {
      ui: 'tdd',
      require: ['tsx/cjs'],
    },
  };
}
