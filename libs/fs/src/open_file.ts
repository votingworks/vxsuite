import { Result, err, ok } from '@votingworks/basics';
import { Mode } from 'node:fs';
import { FileHandle, open as fsOpen } from 'node:fs/promises';

/**
 * Opens a file and returns a file descriptor. You are responsible for closing
 * the file descriptor when you are done with it. Use `readFile` instead if you
 * need to read the entire file into memory.
 *
 * Opens whatever the path names, including directories, devices and FIFOs; see
 * {@link openRegularFile} for the reasons a caller reading a file's contents
 * wants {@link openRegularFileForReading} instead.
 */
export async function open(
  path: string,
  flags?: string | number,
  mode?: Mode
): Promise<Result<FileHandle, Error>> {
  try {
    return ok(await fsOpen(path, flags, mode));
  } catch (error) {
    return err(error as Error);
  }
}
