import { z } from 'zod';
import { err, ok, Result } from '@votingworks/types';
import { mkdir } from 'fs/promises';
import { any } from 'micromatch';
import { isAbsolute, join, normalize, parse } from 'path';
import { Readable } from 'stream';
import { lstatSync } from 'fs';
import { splitToFiles } from './split';
import { execFile } from './utils/exec';
import { getUsbDrives } from './get_usb_drives';

/**
 * The largest file size that can be exported to a USB drive formatted as FAT32.
 * Since each file size is recorded as a 32-bit unsigned integer, the largest
 * file size is 4,294,967,295 bytes.
 */
const MAXIMUM_FAT32_FILE_SIZE = 2 ** 32 - 1;

/**
 * Possible export errors.
 */
export type ExportDataError =
  | { type: 'relative-file-path'; message: string }
  | { type: 'permission-denied'; message: string }
  | { type: 'file-system-error'; message: string }
  | { type: 'missing-usb-drive'; message: string };

/**
 * Schema for {@link ExportDataError}.
 */
export const ExportFileErrorSchema: z.ZodSchema<ExportDataError> =
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('relative-file-path'),
      message: z.string(),
    }),
    z.object({
      type: z.literal('permission-denied'),
      message: z.string(),
    }),
    z.object({
      type: z.literal('file-system-error'),
      message: z.string(),
    }),
    z.object({
      type: z.literal('missing-usb-drive'),
      message: z.string(),
    }),
  ]);

/**
 * Result of exporting a file to the file system.
 */
export type ExportFileResult = Result<string[], ExportDataError>;

/**
 * Provides data export functionality for writing to the file system.
 */
export class Exporter {
  private readonly allowedExportPatterns: readonly string[];

  /**
   * Builds an exporter with the given allowed export patterns. To allow all
   * paths, use `['**']`. Ideally you should be as specific as possible to avoid
   * writing to unexpected locations.
   */
  constructor({
    allowedExportPatterns,
  }: {
    allowedExportPatterns: Iterable<string>;
  }) {
    this.allowedExportPatterns = Array.from(allowedExportPatterns);
  }

  /**
   * Exports data to a file on the file system. The file and its parent directories
   * will be created if they do not exist. To split the data into multiple files,
   * specify a `maximumFileSize` greater than 0.
   */
  async exportData(
    path: string,
    data: string | NodeJS.ReadableStream,
    {
      maximumFileSize,
    }: {
      maximumFileSize?: number;
    } = {}
  ): Promise<ExportFileResult> {
    const getSafePathResult = this.getSafePathForWriting(path);

    if (getSafePathResult.isErr()) {
      return getSafePathResult;
    }

    const safePath = getSafePathResult.ok();
    const pathParts = parse(safePath);

    await mkdir(pathParts.dir, { recursive: true });

    return ok(
      await splitToFiles(
        typeof data === 'string' ? Readable.from(data) : data,
        {
          size: maximumFileSize ?? Infinity,
          nextPath: (index) =>
            join(pathParts.dir, `${pathParts.base}-part-${index + 1}`),
          singleFileName: pathParts.base,
        }
      )
    );
  }

  /**
   * Exports data to a USB drive. The file and its parent directories will be
   * created if they do not exist. By default the data will be split into multiple
   * files if it is larger than the maximum FAT32 file size. To disable this, set
   * `maximumFileSize` to `Infinity`.
   *
   * Once the promise returned by this function resolves, the data has been
   * successfully written to the USB drive and it may be safely unmounted.
   *
   * @returns a list of the paths of the files that were created, or an error
   */
  async exportDataToUsbDrive(
    bucket: string,
    name: string,
    data: string | NodeJS.ReadableStream,
    {
      maximumFileSize = MAXIMUM_FAT32_FILE_SIZE,
    }: {
      maximumFileSize?: number;
    } = {}
  ): Promise<ExportFileResult> {
    const [usbDrive] = await getUsbDrives();

    if (!usbDrive?.mountPoint) {
      return err({
        type: 'missing-usb-drive',
        message: 'No USB drive found',
      });
    }

    const result = await this.exportData(
      join(usbDrive.mountPoint, bucket, name),
      data,
      { maximumFileSize }
    );

    // Exporting a file might take a while. Ensure the data is flushed to the USB
    // drive before we consider it safe to remove.
    await execFile('sync', ['-f', usbDrive.mountPoint]);

    return result;
  }

  /**
   * Validates that the path is allowed for export. Checks that the path will not
   * allow writing outside of the allowed export patterns either via symlinks or
   * by using `..` to escape the allowed export patterns.
   */
  private getSafePathForWriting(path: string): Result<string, ExportDataError> {
    if (!isAbsolute(path)) {
      return err({
        type: 'relative-file-path',
        message: `Path must be absolute: ${path}`,
      });
    }

    const normalizedPath = normalize(path);

    if (!any(normalizedPath, this.allowedExportPatterns)) {
      return err({
        type: 'permission-denied',
        message: `Path is not allowed: ${path}`,
      });
    }

    // gets e.g. ['/', '/foo', '/foo/bar'] from '/foo/bar'
    const allPathPrefixes = normalizedPath
      .split('/')
      .map((_, index, parts) =>
        index === 0 ? '/' : parts.slice(0, index + 1).join('/')
      );

    for (const pathPrefix of allPathPrefixes) {
      if (this.isSymbolicLink(pathPrefix)) {
        return err({
          type: 'permission-denied',
          message: `Path must not contain symbolic links: ${path}`,
        });
      }
    }

    return ok(normalizedPath);
  }

  /**
   * Determines whether the given path exists and is a symbolic link.
   */
  private isSymbolicLink(path: string): boolean {
    try {
      return lstatSync(path).isSymbolicLink();
    } catch (error) {
      if (
        error &&
        'code' in (error as { code?: string }) &&
        (error as { code: string }).code === 'ENOENT'
      ) {
        return false;
      }

      /* istanbul ignore next */
      throw error;
    }
  }
}
