import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, beforeEach } from 'vitest';
import tmp from 'tmp';
import { readMachineMode, writeMachineMode } from './machine_mode';

let workspacePath: string;

beforeEach(() => {
  workspacePath = tmp.dirSync().name;
});

describe('readMachineMode', () => {
  test('returns host when no mode file exists', () => {
    expect(readMachineMode(workspacePath)).toEqual('host');
  });

  test('returns host when mode file contains host', () => {
    writeFileSync(join(workspacePath, 'machine_mode'), 'host', 'utf-8');
    expect(readMachineMode(workspacePath)).toEqual('host');
  });

  test('returns client when mode file contains client', () => {
    writeFileSync(join(workspacePath, 'machine_mode'), 'client', 'utf-8');
    expect(readMachineMode(workspacePath)).toEqual('client');
  });

  test('returns host for unrecognized mode file contents', () => {
    writeFileSync(join(workspacePath, 'machine_mode'), 'unknown', 'utf-8');
    expect(readMachineMode(workspacePath)).toEqual('host');
  });

  test('trims whitespace from mode file', () => {
    writeFileSync(join(workspacePath, 'machine_mode'), '  client\n', 'utf-8');
    expect(readMachineMode(workspacePath)).toEqual('client');
  });
});

describe('writeMachineMode', () => {
  test('writes host mode', () => {
    writeMachineMode(workspacePath, 'host');
    expect(readMachineMode(workspacePath)).toEqual('host');
  });

  test('writes client mode', () => {
    writeMachineMode(workspacePath, 'client');
    expect(readMachineMode(workspacePath)).toEqual('client');
  });

  test('creates the file if it does not exist', () => {
    const filePath = join(workspacePath, 'machine_mode');
    expect(existsSync(filePath)).toEqual(false);
    writeMachineMode(workspacePath, 'client');
    expect(existsSync(filePath)).toEqual(true);
  });

  test('overwrites existing mode', () => {
    writeMachineMode(workspacePath, 'client');
    expect(readMachineMode(workspacePath)).toEqual('client');
    writeMachineMode(workspacePath, 'host');
    expect(readMachineMode(workspacePath)).toEqual('host');
  });
});
