import util from 'node:util';

import { err, ok, Result } from '@votingworks/basics';
import { LogEventId, Logger } from '@votingworks/logging';

import { execFile } from '../exec';
import { NODE_ENV } from '../scan_globals';

/**
 * Pulse Audio special name for the default sink for the currently active audio
 * card/profile.
 * https://man.archlinux.org/man/pactl.1#COMMANDS
 */
export const AUDIO_DEVICE_DEFAULT_SINK = '@DEFAULT_SINK@';

/**
 * Runs the Pulse Audio `pactl` shell command with the given args and returns
 * the resulting output on success.
 */
export async function pactl(
  nodeEnv: typeof NODE_ENV,
  logger: Logger,
  args: string[]
): Promise<Result<string, string>> {
  try {
    const res =
      nodeEnv === 'production'
        ? await execFile('sudo', ['/vx/code/app-scripts/pactl.sh', ...args])
        : await execFile('pactl', args);

    if (res.stderr) {
      // Doesn't represent an error (non-zero exit codes will trigger the
      // exception path), but worth tracking potential warning notices.
      logger.log(LogEventId.Info, 'system', {
        message: `unexpected stderr output from pactl: ${res.stderr}`,
      });
    }

    return ok(res.stdout);
  } catch (error) {
    return err(`pactl command error: ${util.inspect(error)}`);
  }
}
