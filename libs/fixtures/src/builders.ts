import {
  DEFAULT_SYSTEM_SETTINGS,
  Election,
  ElectionDefinition,
  ElectionPackage,
  ImageData,
  safeParseElection,
  safeParseElectionDefinition,
  SystemSettings,
} from '@votingworks/types';
import { createCanvas, loadImage } from 'canvas';
import assert from 'node:assert';
import { Buffer } from 'node:buffer';
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { getPathForFile } from './tmpdir';

/**
 * A generic file fixture.
 */
export interface FileFixture {
  /**
   * Returns a path to a temporary file containing the file contents.
   */
  asFilePath(): string;

  /**
   * Returns the file contents as a buffer.
   */
  asBuffer(): Buffer;

  /**
   * Returns the file contents as a string.
   */
  asText(): string;
}

/**
 * A generic directory fixture.
 */
export interface DirectoryFixture {
  /**
   * Returns a path to a temporary directory containing the directory contents.
   */
  asDirectoryPath(): string;
}

/**
 * A fixture for an election file.
 */
export interface ElectionFixture extends FileFixture {
  /**
   * Reads the election from the file.
   */
  readElection(): Election;

  /**
   * Reads the election definition from the file.
   */
  readElectionDefinition(): ElectionDefinition;

  /**
   * Converts the election file to an election package.
   */
  toElectionPackage(systemSettings?: SystemSettings): ElectionPackage;
}

/**
 * A fixture for an image file.
 */
export interface ImageFixture extends FileFixture {
  /**
   * Returns the image as an ImageData object.
   */
  asImageData(): Promise<ImageData>;
}

/**
 * Locates a resource file relative to the current module.
 */
function locate(path: string): string {
  let rootDir = __dirname;
  do {
    if (existsSync(join(rootDir, 'package.json'))) {
      const realPath = join(rootDir, path);
      assert(
        existsSync(realPath),
        `Could not locate resource with path: ${path}`
      );
      return realPath;
    }
    const parentDir = dirname(rootDir);
    /* istanbul ignore next - @preserve */
    if (parentDir === '.' || parentDir === rootDir) {
      break;
    }
    rootDir = parentDir;
    // eslint-disable-next-line no-constant-condition
  } while (true);

  /* istanbul ignore next - @preserve */
  throw new Error(`Could not locate resource with path: ${path}`);
}

/**
 * Creates a file fixture for the given path.
 *
 * @param path The path to the file relative to the package root.
 */
export function file(path: string): FileFixture {
  const realPath = locate(path);
  const base = basename(realPath);
  let counter = 0;
  const prefix = path.replaceAll(/[^\w]/g, '-');
  return {
    asFilePath(): string {
      counter += 1;
      const filePath = getPathForFile(`${prefix}-${counter}/${base}`);
      mkdirSync(dirname(filePath), { recursive: true });
      cpSync(realPath, filePath);
      return filePath;
    },
    asBuffer(): Buffer {
      return readFileSync(realPath);
    },
    asText(): string {
      return readFileSync(realPath, 'utf-8');
    },
  };
}

/**
 * Creates a directory fixture for the given path.
 *
 * @param path The path to the directory relative to the package root.
 */
export function directory(path: string): DirectoryFixture {
  const realPath = locate(path);
  let counter = 0;
  const prefix = path.replaceAll(/[^\w]/g, '-');
  return {
    asDirectoryPath(): string {
      counter += 1;
      const directoryPath = getPathForFile(`${prefix}-${counter}`);
      cpSync(realPath, directoryPath, { recursive: true });
      return directoryPath;
    },
  };
}

/**
 * Creates an election fixture for the given path.
 *
 * @param path The path to the election file relative to the package root.
 */
export function election(path: string): ElectionFixture {
  const inner = file(path);
  return {
    ...inner,
    readElection: () => safeParseElection(inner.asText()).unsafeUnwrap(),
    readElectionDefinition: () =>
      safeParseElectionDefinition(inner.asText()).unsafeUnwrap(),
    toElectionPackage: (systemSettings = DEFAULT_SYSTEM_SETTINGS) => ({
      electionDefinition: safeParseElectionDefinition(
        inner.asText()
      ).unsafeUnwrap(),
      systemSettings,
    }),
  };
}

/**
 * Creates an image fixture for the given path.
 *
 * @param path The path to the image file relative to the package root.
 */
export function image(path: string): ImageFixture {
  const realPath = locate(path);
  const inner = file(path);
  return {
    ...inner,
    async asImageData(): Promise<ImageData> {
      const img = await loadImage(realPath);
      const canvas = createCanvas(img.width, img.height);
      const context = canvas.getContext('2d');
      context.drawImage(img, 0, 0);
      return context.getImageData(0, 0, img.width, img.height);
    },
  };
}
