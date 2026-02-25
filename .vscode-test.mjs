/** @import { TestConfiguration } from '@vscode/test-cli' */
import { defineConfig } from '@vscode/test-cli';

export default defineConfig([
  ...createVersionConfigs('ms-dotnettools', 'csharp', [
    { label: 'v2.110.4', version: '2.110.4', skipTag: '@skip-v2.110' },
  ]),
]);

/**
 * @param {string} publisher
 * @param {string} extension
 * @param {Array<{version: string|null, label: string, skipTag?: string}>} versions
 * @returns {TestConfiguration[]}
 */
export function createVersionConfigs(publisher, extension, versions) {
  return versions.map(({ version, label, skipTag }) => ({
    label,
    files: 'src/tests/**/*.test.ts',
    workspaceFolder: './src/tests/workspace',
    installExtensions: [`${publisher}.${extension}${version ? `@${version}` : ''}`],
    env: {
      DEP_NAME: `${publisher}.${extension}`,
      DEP_VERSION: `${version ? `${version}` : ''}`,
    },
    launchArgs: [
      '--headless',
      '--disable-workspace-trust',
      '--disable-extension-updates',
      `--profile=test-profile-${label}`,
    ],
    mocha: {
      ui: 'tdd',
      require: ['tsx/cjs'],
      ...(skipTag ? { grep: skipTag, invert: true } : {}),
    },
  }));
}
