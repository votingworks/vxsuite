import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MachineMode } from './types.js';

const MACHINE_MODE_FILENAME = 'machine_mode';

function machineModeFilePath(workspacePath: string): string {
  return join(workspacePath, MACHINE_MODE_FILENAME);
}

/**
 * Reads the machine mode from the workspace directory. Returns 'host' if no
 * mode file exists.
 */
export function readMachineMode(workspacePath: string): MachineMode {
  const filePath = machineModeFilePath(workspacePath);
  if (!existsSync(filePath)) {
    return 'host';
  }
  const contents = readFileSync(filePath, 'utf-8').trim();
  if (contents === 'client') {
    return 'client';
  }
  return 'host';
}

/**
 * Writes the machine mode to the workspace directory.
 */
export function writeMachineMode(
  workspacePath: string,
  mode: MachineMode
): void {
  const filePath = machineModeFilePath(workspacePath);
  writeFileSync(filePath, mode, 'utf-8');
}
