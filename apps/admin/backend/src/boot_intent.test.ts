import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  makeTemporaryDirectory,
  makeTemporaryFile,
  makeTemporaryPath,
} from '@votingworks/fixtures';
import { FileBackedBootIntentController } from './boot_intent.js';
import { getWorkspaceControlPath } from './util/workspace.js';

test('nothing is pending when no intent was requested', () => {
  const controller = new FileBackedBootIntentController(makeTemporaryPath());
  expect(controller.take()).toBeUndefined();
});

test('a requested intent is handed over exactly once', () => {
  const filePath = makeTemporaryPath();
  const controller = new FileBackedBootIntentController(filePath);

  controller.request('restore');
  expect(readFileSync(filePath, 'utf-8')).toEqual('restore');

  expect(controller.take()).toEqual('restore');
  expect(existsSync(filePath)).toEqual(false);

  // Spent by the taking: the boot after the one that acts on it is ordinary.
  expect(controller.take()).toBeUndefined();
});

test('surrounding whitespace does not change an intent', () => {
  const controller = new FileBackedBootIntentController(
    makeTemporaryFile({ content: '  restore\n' })
  );
  expect(controller.take()).toEqual('restore');
});

test('contents that are not an intent are cleared and mean nothing', () => {
  const filePath = makeTemporaryFile({ content: 'reboot' });
  const controller = new FileBackedBootIntentController(filePath);

  expect(controller.take()).toBeUndefined();
  expect(existsSync(filePath)).toEqual(false);
});

test('fails if the file is there but cannot be read', () => {
  const controller = new FileBackedBootIntentController(
    makeTemporaryDirectory()
  );
  expect(() => controller.take()).toThrow();
});

test('forWorkspace keeps the intent in the control directory', () => {
  const workspacePath = makeTemporaryDirectory();

  FileBackedBootIntentController.forWorkspace(workspacePath).request('restore');

  expect(
    existsSync(join(getWorkspaceControlPath(workspacePath), 'next_boot'))
  ).toEqual(true);
  expect(
    FileBackedBootIntentController.forWorkspace(workspacePath).take()
  ).toEqual('restore');
});
