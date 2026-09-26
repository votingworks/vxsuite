import { type Result, err, ok } from '@votingworks/basics';
import { openRegularFileForWriting } from './open_regular_file.js';

/**
 * Possible errors that can occur when writing a file.
 */
export type WriteFileError =
  | { type: 'OpenFileError'; error: globalThis.Error }
  | { type: 'NotRegularFile' }
  | { type: 'WriteFileError'; error: globalThis.Error };

/**
 * Writes the entire contents of a file, creating it if it is not there and
 * truncating it if it is. The counterpart to {@link readFile}, and like it
 * refuses a path holding anything but a regular file: see
 * {@link openRegularFileForWriting}.
 *
 * If `append: true` is given, appends `contents` to the file rather than
 * replacing the file contents.
 */
export async function writeFile(
  path: string,
  contents: string | Uint8Array,
  options?: { append?: boolean }
): Promise<Result<void, WriteFileError>> {
  const openResult = await openRegularFileForWriting(path, options);

  if (openResult.isErr()) {
    const error = openResult.err();
    return err(
      error.type === 'NotRegularFile'
        ? { type: 'NotRegularFile' }
        : { type: 'OpenFileError', error: error.error }
    );
  }

  const fd = openResult.ok();

  try {
    await fd.writeFile(contents);
  } catch (error) {
    return err({ type: 'WriteFileError', error: error as globalThis.Error });
  } finally {
    // However this ended, the descriptor must not leak.
    await fd.close();
  }

  return ok();
}
