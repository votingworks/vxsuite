import { err, ok, Result } from '@votingworks/basics';
import { FileBackedMachineModeController } from '../machine_mode.js';

/**
 * Checks that a workspace belongs to a VxAdmin in host mode, which is the only
 * mode whose workspace holds the election database a backup is made of. A
 * client machine keeps whatever database it had before it was switched, so
 * backing one up would capture data the machine is no longer using, and
 * restoring into one would replace the machine's mode along with its data.
 *
 * Read from the workspace rather than from the running process, so that the
 * answer is what the machine will be when it next starts — which for a restore
 * is the machine that has to read what was restored.
 */
export function checkWorkspaceIsHostMode(
  workspacePath: string
): Result<void, { type: 'not-host-mode'; message: string }> {
  const mode =
    FileBackedMachineModeController.forWorkspace(workspacePath).get();

  return mode === 'host'
    ? ok()
    : err({
        type: 'not-host-mode',
        message: `Only a VxAdmin in host mode can be backed up or restored, but this one is in ${mode} mode`,
      });
}
