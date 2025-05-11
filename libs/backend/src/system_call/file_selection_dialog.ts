import { ok, err, Result } from '@votingworks/basics';
import { LogEventId, Logger } from '@votingworks/logging';
import { execFile } from '../exec';

/**
 * Options for the file selection dialog.
 */
export interface OpenFileDialogOptions {
  title?: string;
  defaultPath?: string;
  buttonLabel?: string;
  extensions?: string[];
}

type OpenFileDialogError = 'no-file-selected' | 'unknown-error';

/**
 * Blank.
 */
export type OpenFileDialogResult = Result<string, OpenFileDialogError>;

/** Get current system audio status. */
export async function openFileDialog(
  options: OpenFileDialogOptions,
  logger: Logger
): Promise<OpenFileDialogResult> {
  let errorOutput: string;
  let commandOutput: string;

  const commandOptions = [];
  if (options.title) {
    commandOptions.push('--title', options.title);
  }
  if (options.defaultPath) {
    commandOptions.push('--filename', options.defaultPath);
  }
  if (options.buttonLabel) {
    commandOptions.push('--text', options.buttonLabel);
  }
  if (options.extensions) {
    commandOptions.push(
      '--file-filter',
      options.extensions.map((s) => `*.${s}`).join(' ')
    );
  }

  try {
    ({ stderr: errorOutput, stdout: commandOutput } = await execFile('zenity', [
      '--file-selection',
      ...commandOptions,
    ]));

    if (errorOutput) {
      void logger.logAsCurrentRole(LogEventId.FileSelectionDialog, {
        message: `file selection dialog failed unexpected with error: ${errorOutput}`,
        disposition: 'failure',
      });
      return err('unknown-error');
    }

    return ok(commandOutput.trim());
  } catch (error) {
    void logger.logAsCurrentRole(LogEventId.FileSelectionDialog, {
      message: 'User did not make a file selection.',
      disposition: 'failure',
    });
    return err('no-file-selected');
  }
}
