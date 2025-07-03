import assert from 'node:assert';
import * as crypto from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';
import Stream from 'node:stream';

let temporaryRootDir: string | undefined;

/**
 * Sets the temporary root directory for fixtures.
 *
 * @throws If the temporary root directory has already been set.
 */
export function setTemporaryRootDir(path: string): void {
  assert(
    temporaryRootDir === undefined,
    'Temporary root directory already set; call clearTemporaryRootDir first'
  );
  temporaryRootDir = path;
}

/**
 * Creates unique directory for fixtures and sets it as the temporary root
 * directory with {@link setTemporaryRootDir}.
 *
 * @throws If the temporary root directory has already been set.
 */
export function setupTemporaryRootDir(): void {
  assert(
    temporaryRootDir === undefined,
    'Temporary root directory already set; call clearTemporaryRootDir first'
  );
  const rootDir = join(tmpdir(), `vx-fixtures-${Date.now()}-${process.pid}`);
  mkdirSync(rootDir, { recursive: true });
  setTemporaryRootDir(rootDir);
}

/**
 * Returns the temporary root directory for fixtures.
 *
 * @throws If the temporary root directory has not been set.
 */
export function getTemporaryRootDir(): string {
  assert(
    temporaryRootDir !== undefined,
    'Temporary root directory not set; call setupTemporaryRootDir first. Hint: is the call in your test happening before `beforeAll`?'
  );
  return temporaryRootDir;
}

/**
 * Deletes the temporary root directory for fixtures and unsets it. If the
 * temporary root directory has not been set, this function does nothing.
 */
export function clearTemporaryRootDir(): void {
  if (temporaryRootDir) {
    rmSync(temporaryRootDir, { recursive: true, force: true });
  }
  temporaryRootDir = undefined;
}

/**
 * Returns the path for a file within the temporary root directory for fixtures.
 *
 * @param filePath - The path of the file relative to the temporary root directory,
 *                   must not start with "/" or "..".
 */
export function getPathForFile(filePath: string): string {
  assert(
    temporaryRootDir !== undefined,
    'Temporary root directory not set; call setupTemporaryRootDir first. Hint: is the call in your test happening before `beforeAll`?'
  );
  const normalizedFilePath = normalize(filePath);
  assert(!normalizedFilePath.startsWith('/'), 'File path must be relative');
  assert(
    !normalizedFilePath.startsWith('..'),
    'File path must not start with ".."'
  );
  return join(temporaryRootDir, filePath);
}

/**
 * Options for generating a temporary file system entry name.
 */
export interface TemporaryNameOptions {
  prefix?: string;
  postfix?: string;
}

/**
 * Makes a path to a temporary file system entry within the root temporary
 * directory, but does not actually create anything.
 *
 * @throws If the temporary root directory has not been set.
 */
export function makeTemporaryPath(options?: TemporaryNameOptions): string {
  let name = crypto.randomUUID();
  if (options?.prefix) {
    name = options.prefix + name;
  }
  if (options?.postfix) {
    name += options.postfix;
  }

  return join(getTemporaryRootDir(), name);
}

/**
 * Create a temporary directory within the root temporary directory.
 *
 * @throws If the temporary root directory has not been set.
 */
export function makeTemporaryDirectory(options?: TemporaryNameOptions): string {
  const path = makeTemporaryPath(options);
  mkdirSync(path, { recursive: true });
  return path;
}

/**
 * Options for generating a temporary file.
 */
export interface TemporaryFileOptions extends TemporaryNameOptions {
  content?: string | NodeJS.ArrayBufferView;
}

/**
 * Create a temporary file within the root temporary directory.
 *
 * @throws If the temporary root directory has not been set.
 */
export function makeTemporaryFile(options?: TemporaryFileOptions): string {
  const path = makeTemporaryPath(options);
  writeFileSync(path, options?.content ?? '');
  return path;
}
/**
 * Options for generating a temporary file asynchronously.
 */
export interface TemporaryFileAsyncOptions extends TemporaryNameOptions {
  content?:
    | string
    | NodeJS.ArrayBufferView
    | Iterable<string | NodeJS.ArrayBufferView>
    | AsyncIterable<string | NodeJS.ArrayBufferView>
    | Stream;
}

/**
 * Create a temporary file within the root temporary directory asynchronously.
 *
 * @throws If the temporary root directory has not been set.
 */
export async function makeTemporaryFileAsync(
  options?: TemporaryFileAsyncOptions
): Promise<string> {
  const path = makeTemporaryPath(options);
  await writeFile(path, options?.content ?? '');
  return path;
}
