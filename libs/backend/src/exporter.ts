import { err, ok, type Result, throwIllegalValue } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { lstat, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, matchesGlob, normalize } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createReadStream, lstatSync } from 'node:fs';
import type { ExportDataError as BaseExportDataError } from '@votingworks/types';
import { openRegularFileForWriting } from '@votingworks/fs';
import type { MountedUsbDriveStatus, UsbDrive } from '@votingworks/usb-drive';
import { checkFileFitsOnUsbDrive, format } from '@votingworks/utils';

/**
 * Types that may be exported.
 */
export type ExportableData =
  | string
  | Uint8Array
  | Iterable<string | Uint8Array>
  | AsyncIterable<string | Uint8Array>
  | NodeJS.ReadableStream;

function destroyIfStream(data: ExportableData): void {
  if (data instanceof Readable) {
    data.destroy();
  }
}

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
   * Exports data to a file on the file system. The file and its parent
   * directories will be created if they do not exist.
   */
  async exportData(
    path: string,
    data: ExportableData
  ): Promise<ExportDataResult> {
    try {
      return await this.writeData(path, data);
    } finally {
      destroyIfStream(data);
    }
  }

  private async writeData(
    path: string,
    data: ExportableData
  ): Promise<ExportDataResult> {
    const getSafePathResult = this.getSafePathForWriting(path);

    if (getSafePathResult.isErr()) {
      return getSafePathResult;
    }

    const safePath = getSafePathResult.ok();
    await mkdir(dirname(safePath), { recursive: true });

    // Reject special files without opening or truncating the destination.
    try {
      const stats = await lstat(safePath);
      if (!stats.isFile()) {
        return err({
          type: 'file-system-error',
          message: `Path is not a regular file: ${path}`,
        });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        return err({
          type: 'file-system-error',
          message: `Unable to inspect ${path}: ${(error as Error).message}`,
        });
      }
    }

    // Keep the temporary file on the same filesystem so rename is atomic.
    const temporaryDirectory = await mkdtemp(
      join(dirname(safePath), '.export-')
    );
    const temporaryPath = join(temporaryDirectory, 'data');
    try {
      const openResult = await openRegularFileForWriting(temporaryPath);
      if (openResult.isErr()) {
        const error = openResult.err();
        switch (error.type) {
          case 'NotRegularFile':
            return err({
              type: 'file-system-error',
              message: `Path is not a regular file: ${path}`,
            });
          case 'OpenFileError':
            return err({
              type: 'file-system-error',
              message: `Unable to open ${path} for writing: ${error.error.message}`,
            });
          default:
            return throwIllegalValue(error);
        }
      }

      try {
        await pipeline(
          Readable.from(
            // `Readable.from` iterates a bare `Uint8Array` element by element,
            // yielding numbers instead of a single binary chunk, so wrap it.
            data instanceof Uint8Array && !(data instanceof Buffer)
              ? Buffer.from(data)
              : data
          ),
          openResult.ok().createWriteStream()
        );
        await rename(temporaryPath, safePath);
      } catch (error) {
        return err({
          type: 'file-system-error',
          message: `Unable to write ${path}: ${(error as Error).message}`,
        });
      }
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
    return ok([safePath]);
  }

  /**
   * Exports data to a USB drive. The file and its parent directories will be
   * created if they do not exist.
   *
   * Once the promise returned by this function resolves, the data has been
   * successfully written to the USB drive and it may be safely unmounted.
   *
   * If `machineDirectoryToWriteToFirst` is provided, data will be written to
   * that directory first and then copied from there to the USB drive. The data
   * written to `machineDirectoryToWriteToFirst` will be left intact for other
   * code to use, e.g. for signature file creation.
   *
   * If `size` is provided, the export fails before writing anything to the USB
   * drive when the drive's file system cannot hold a file that large or the
   * drive lacks the space for it.
   *
   * @returns a list of the paths of the files that were created, or an error
   */
  async exportDataToUsbDrive(
    bucket: string,
    name: string,
    data: ExportableData,
    {
      machineDirectoryToWriteToFirst,
      size,
    }: {
      machineDirectoryToWriteToFirst?: string;
      size?: number;
    } = {}
  ): Promise<ExportDataResult> {
    const machineFilePath =
      machineDirectoryToWriteToFirst &&
      join(machineDirectoryToWriteToFirst, name);
    if (machineFilePath) {
      const result = await this.exportData(machineFilePath, data);
      // @coverage-defer
      if (result.isErr()) {
        return result;
      }
    }

    const usbDriveStatus = await this.usbDrive.status();

    if (usbDriveStatus.status !== 'mounted') {
      destroyIfStream(data);
      return err({
        type: 'missing-usb-drive',
        message: 'No USB drive found',
      });
    }

    if (size !== undefined) {
      const fitResult = checkFitOnUsbDrive(usbDriveStatus, size);
      if (fitResult.isErr()) {
        destroyIfStream(data);
        return fitResult;
      }
    }

    const result = await this.exportData(
      join(usbDriveStatus.mountpoint, bucket, name),
      machineFilePath ? createReadStream(machineFilePath) : data
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

    if (
      !this.allowedExportPatterns.some((pattern) =>
        matchesGlob(normalizedPath, pattern)
      )
    ) {
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

      // @coverage-exclude
      throw error;
    }
  }
}

function checkFitOnUsbDrive(
  usbDriveStatus: MountedUsbDriveStatus,
  size: number
): Result<void, ExportDataError> {
  const fit = checkFileFitsOnUsbDrive(usbDriveStatus, size);
  switch (fit.type) {
    case 'fits':
      return ok();
    case 'file-too-large':
      return err({
        type: 'file-too-large',
        message: `File of ${format.bytes(size)} exceeds the USB drive's ${format.bytes(fit.maxFileSize)} file size limit`,
      });
    case 'insufficient-space':
      return err({
        type: 'insufficient-space',
        message: `File of ${format.bytes(size)} does not fit in the ${format.bytes(fit.availableBytes)} available on the USB drive`,
      });
    case 'drive-too-small':
      return err({
        type: 'insufficient-space',
        message: `File of ${format.bytes(size)} does not fit on the ${format.bytes(fit.totalBytes)} USB drive`,
      });
    default:
      return throwIllegalValue(fit, 'type');
  }
}
