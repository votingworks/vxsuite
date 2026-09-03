import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isNonExistentFileOrDirectoryError } from '@votingworks/basics';
import { getWorkspaceControlPath } from './util/workspace.js';

/**
 * What a machine has been asked to do the next time it starts, instead of
 * running in whatever mode it is in. `restore` starts it in restore mode, where
 * a backup can be restored into a workspace nothing is serving.
 */
export type BootIntent = 'restore';

/**
 * Records an intent for the next boot and hands it over exactly once. Unlike a
 * machine mode, an intent is spent by being taken: whatever the boot that takes
 * it goes on to do, the boot after that is an ordinary one.
 */
export interface BootIntentController {
  request(intent: BootIntent): void;

  /**
   * Returns the pending intent, if any, and clears it.
   */
  take(): BootIntent | undefined;
}

/**
 * Keeps the boot intent in a file, present only while an intent is pending.
 */
export class FileBackedBootIntentController implements BootIntentController {
  constructor(private readonly filePath: string) {}

  request(intent: BootIntent): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, intent, 'utf-8');
  }

  take(): BootIntent | undefined {
    let contents: string;
    try {
      contents = readFileSync(this.filePath, 'utf-8');
    } catch (error) {
      if (isNonExistentFileOrDirectoryError(error)) {
        return undefined;
      }
      throw error;
    }

    // Cleared before it is acted on, and not with `force`: a file that cannot
    // be removed would send every boot from here on into restore mode, which
    // is worth failing loudly over.
    rmSync(this.filePath);

    return contents.trim() === 'restore' ? 'restore' : undefined;
  }

  static forWorkspace(workspacePath: string): FileBackedBootIntentController {
    return new FileBackedBootIntentController(
      join(getWorkspaceControlPath(workspacePath), 'next_boot')
    );
  }
}
