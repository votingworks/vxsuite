import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  makeTemporaryDirectory,
  makeTemporaryFile,
  makeTemporaryPath,
} from '@votingworks/fixtures';
import { FileBackedMachineModeController } from './machine_mode.js';
import { MachineMode } from './types.js';

describe('FileBackedMachineModeController::get', () => {
  test('returns host when no mode file exists', () => {
    const controller = new FileBackedMachineModeController(makeTemporaryPath());
    expect(controller.get()).toEqual('host');
  });

  test('returns host when mode file contains host', () => {
    const controller = new FileBackedMachineModeController(
      makeTemporaryFile({ content: 'host' })
    );
    expect(controller.get()).toEqual('host');
  });

  test('returns client when mode file contains client', () => {
    const controller = new FileBackedMachineModeController(
      makeTemporaryFile({ content: 'client' })
    );
    expect(controller.get()).toEqual('client');
  });

  test('returns host for unrecognized mode file contents', () => {
    const controller = new FileBackedMachineModeController(
      makeTemporaryFile({ content: 'unknown' })
    );
    expect(controller.get()).toEqual('host');
  });

  test('trims whitespace from mode file', () => {
    const controller = new FileBackedMachineModeController(
      makeTemporaryFile({ content: '  client\n' })
    );
    expect(controller.get()).toEqual('client');
  });

  test('fails if an existing mode file exists but cannot be read', () => {
    const controller = new FileBackedMachineModeController(
      makeTemporaryDirectory()
    );
    expect(() => controller.get()).toThrow();
  });
});

describe('FileBackedMachineModeController::set', () => {
  test('writes host mode', () => {
    const controller = new FileBackedMachineModeController(makeTemporaryFile());
    controller.set('host');
    expect(controller.get()).toEqual('host');
  });

  test('writes client mode', () => {
    const controller = new FileBackedMachineModeController(makeTemporaryFile());
    controller.set('client');
    expect(controller.get()).toEqual('client');
  });

  test('creates the file if it does not exist', () => {
    const filePath = makeTemporaryPath();
    expect(existsSync(filePath)).toBeFalsy();
    const controller = new FileBackedMachineModeController(filePath);
    controller.set('client');
    expect(existsSync(filePath)).toBeTruthy();
  });

  test('overwrites existing mode', () => {
    const controller = new FileBackedMachineModeController(makeTemporaryFile());
    controller.set('client');
    expect(controller.get()).toEqual('client');
    controller.set('host');
    expect(controller.get()).toEqual('host');
  });

  test('replaces junk data with the default', () => {
    const filePath = makeTemporaryFile();
    const controller = new FileBackedMachineModeController(filePath);
    controller.set('#!/usr/bin/env bash\nreboot' as unknown as MachineMode);
    expect(readFileSync(filePath, 'utf-8')).toEqual('host');
  });
});
