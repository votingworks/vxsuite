import { err, ok, Result } from '@votingworks/basics';
import { mkdir, writeFile } from 'node:fs/promises';
import { any } from 'micromatch';
import { isAbsolute, join, normalize, parse } from 'node:path';
import { Readable } from 'node:stream';
import { createReadStream, lstatSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { ExportDataError as BaseExportDataError } from '@votingworks/types';
import { UsbDrive } from '@votingworks/usb-drive';
import { splitToFiles } from './split';

/**
 * The largest file size that can be exported to a USB drive formatted as FAT32.
 * Since each file size is recorded as a 32-bit unsigned integer, the largest
 * file size is 4,294,967,295 bytes.
 */
const MAXIMUM_FAT32_FILE_SIZE = 2 ** 32 - 1;

/**
 * Types that may be exported.
 */
export type ExportableData =
  | string
  | Buffer
  | Iterable<string | Buffer>
  | AsyncIterable<string | Buffer>
  | NodeJS.ReadableStream;

/**
 * Possible export errors.
 */
export interface ExportDataError {
  type: BaseExportDataError;
  message: string;
}

/**
 * Result of exporting data to the file system.
 */
export type ExportDataResult = Result<string[], ExportDataError>;

/** Settings for the {@link Exporter}. */
export interface ExporterSettings {
  allowedExportPatterns: Iterable<string>;
  usbDrive: UsbDrive;
}

/**
 * Provides data export functionality for writing to the file system.
 */
export class Exporter {
  private readonly allowedExportPatterns: readonly string[];
  private readonly usbDrive: UsbDrive;

  /**
   * Builds an exporter with the given allowed export patterns. To allow all
   * paths, use `['**']`. Ideally you should be as specific as possible to avoid
   * writing to unexpected locations.
   */
  constructor({ allowedExportPatterns, usbDrive }: ExporterSettings) {
    this.allowedExportPatterns = Array.from(allowedExportPatterns);
    this.usbDrive = usbDrive;
  }

  /**
   * Exports data to a file on the file system. The file and its parent directories
   * will be created if they do not exist. To split the data into multiple files,
   * specify a `maximumFileSize` greater than 0.
   */
  async exportData(
    path: string,
    data: ExportableData,
    {
      maximumFileSize,
    }: {
      maximumFileSize?: number;
    } = {}
  ): Promise<ExportDataResult> {
    const getSafePathResult = this.getSafePathForWriting(path);

    if (getSafePathResult.isErr()) {
      return getSafePathResult;
    }

    const safePath = getSafePathResult.ok();
    const pathParts = parse(safePath);

    await mkdir(pathParts.dir, { recursive: true });

    const paths = await splitToFiles(Readable.from(data), {
      size: maximumFileSize ?? Infinity,
      nextPath: (index) =>
        join(pathParts.dir, `${pathParts.base}-part-${index + 1}`),
      singleFileName: pathParts.base,
    });
    // If the data was empty, splitToFiles won't create any files, but we still
    // want to create an empty file.
    if (paths.length === 0) {
      await writeFile(safePath, '');
      paths.push(safePath);
    }
    return ok(paths);
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
   * If `machineDirectoryToWriteToFirst` is provided, data will be written to
   * that directory first and then copied from there to the USB drive. The data
   * written to `machineDirectoryToWriteToFirst` will be left intact for other
   * code to use, e.g. for signature file creation.
   *
   * @returns a list of the paths of the files that were created, or an error
   */
  async exportDataToUsbDrive(
    bucket: string,
    name: string,
    data: ExportableData,
    {
      machineDirectoryToWriteToFirst,
      maximumFileSize = MAXIMUM_FAT32_FILE_SIZE,
    }: {
      machineDirectoryToWriteToFirst?: string;
      maximumFileSize?: number;
    } = {}
  ): Promise<ExportDataResult> {
    let dataToWrite = data;
    if (machineDirectoryToWriteToFirst) {
      const machineFilePath = join(machineDirectoryToWriteToFirst, name);
      const result = await this.exportData(machineFilePath, dataToWrite);
      if (result.isErr()) {
        return result;
      }
      dataToWrite = createReadStream(machineFilePath);
    }

    const usbDriveStatus = await this.usbDrive.status();

    if (usbDriveStatus.status !== 'mounted') {
      return err({
        type: 'missing-usb-drive',
        message: 'No USB drive found',
      });
    }

    const result = await this.exportData(
      join(usbDriveStatus.mountPoint, bucket, name),
      dataToWrite,
      { maximumFileSize }
    );

    // Exporting a file might take a while. Ensure the data is flushed to the USB
    // drive before we consider it safe to remove.
    await this.usbDrive.sync();

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
