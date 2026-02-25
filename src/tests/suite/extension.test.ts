import * as assert from 'assert';
import * as vscode from 'vscode';

import { publisher, name } from '../../../package.json';

suiteSetup(async () => {
  const dependencyName = process.env.DEP_NAME;
  const dependencyVersion = process.env.DEP_VERSION;

  if (!dependencyName || !dependencyVersion) throw new Error('"env.DEP_NAME" or "env.DEP_VERSION" not set.');

  console.log(`Check dependency... '${dependencyName}'`);
  const dependency = vscode.extensions.getExtension(dependencyName);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (!dependency || dependency?.packageJSON.version !== dependencyVersion) {
    console.log(`Installing... '${dependencyName}'`);
    await vscode.commands.executeCommand(
      'workbench.extensions.installExtension',
      `${dependencyName}@${dependencyVersion}`,
    );
    console.log(`Installed... '${dependencyName}'`);
  }
});

suite('Extension Activation', () => {
  test('activates extension', async () => {
    const extension = vscode.extensions.getExtension(`${publisher}.${name}`);
    await extension?.activate();

    assert.strictEqual(extension?.isActive, true);
  });
});
