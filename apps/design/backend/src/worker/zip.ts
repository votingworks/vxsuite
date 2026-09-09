// [TODO] Harden and promote to libs/backend if useful.

import { Buffer } from 'node:buffer';
import { PassThrough, Readable, pipeline } from 'node:stream';
import { ZipArchive, ZipEntryData } from 'archiver';

export const FIXED_ZIP_DATE = new Date('2024-01-01T00:00:00Z');
export const FIXED_ZIP_FILE_MODE = 0o644;

/**
 * Deterministic ZIP archiver with support for lazily creating file streams from
 * queued paths. Avoids open file descriptor limits when zipping large numbers
 * of files.
 *
 * Currently only uses the `store` ZIP compression method. Compression options
 * may be added to the API if needed.
 *
 * ### Example
 * ```ts
 * async function zipFiles(paths: Iterable<string>, outPath: string) {
 *   const zip = new Archiver();
 *   for (const p of paths) zip.addEntryFromPath(p, {name: basename(p)});
 *
 *   await fs.writeFile(outPath, zip.finalize());
 * }
 * ```
 */
export class Archiver {
  private readonly archiver: ZipArchive;
  private readonly outputStream = new PassThrough();

  constructor() {
    this.archiver = new ZipArchive({
      store: true,
    });

    // Path-based file reads are only reported as warnings - this elevates all
    // warnings to errors, since we don't expect any of the former in the
    // happy path.
    //
    // See https://www.archiverjs.com/docs/quickstart#examples
    this.archiver.on('warning', (error) => {
      this.archiver.abort();
      this.archiver.destroy(error);
    });

    pipeline(this.archiver, this.outputStream, () => {
      // Errors handled by caller.
    });
  }

  private makeEntryData(meta: ZipEntryMeta): ZipEntryData {
    return {
      ...meta,
      // [TODO] Make determinism configurable if this is used more broadly.
      date: FIXED_ZIP_DATE,
      mode: FIXED_ZIP_FILE_MODE,
    };
  }

  addEntry(
    contents: Buffer | Readable | string | Uint8Array,
    meta: ZipEntryMeta
  ): void {
    const resolvedContents =
      contents instanceof Uint8Array && !Buffer.isBuffer(contents)
        ? Buffer.from(contents.buffer, contents.byteOffset, contents.byteLength)
        : contents;

    this.archiver.append(resolvedContents, this.makeEntryData(meta));
  }

  addEntryFromPath(filePath: string, meta: ZipEntryMeta): void {
    this.archiver.file(filePath, this.makeEntryData(meta));
  }

  finalize(): Readable {
    // Callers can receive completion signals via the returned output stream, so
    // no need to expose this promise externally.
    void this.archiver.finalize().catch((error) => {
      this.outputStream.destroy(error);
    });

    return this.outputStream;
  }
}

export interface ZipEntryMeta {
  name: string;
}
