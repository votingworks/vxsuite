import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isNonExistentFileOrDirectoryError } from '@votingworks/basics';
import type { MachineMode } from './types.js';
import { getWorkspaceControlPath } from './util/workspace.js';

/**
 * Provides machine mode switching between `host` and `client` modes.
 */
export interface MachineModeController {
  get(): MachineMode;
  set(mode: MachineMode): void;
}

/**
 * Builds a controller that uses `filePath` as the backing store for the current
 * machine mode setting.
 */
export class FileBackedMachineModeController {
  constructor(private readonly filePath: string) {}

  get(): MachineMode {
    try {
      const contents = readFileSync(this.filePath, 'utf-8').trim();
      if (contents === 'client') {
        return 'client';
      }
    } catch (error) {
      if (!isNonExistentFileOrDirectoryError(error)) {
        throw error;
      }
    }

    return 'host';
  }

  set(mode: MachineMode): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, mode === 'client' ? mode : 'host', 'utf-8');
  }

  static forWorkspace(workspacePath: string): FileBackedMachineModeController {
    return new FileBackedMachineModeController(
      join(getWorkspaceControlPath(workspacePath), 'machine_mode')
    );
  }
}
