// [TODO] Harden and promote to libs/backend if useful.

import * as zlib from 'node:zlib';
import { Buffer } from 'node:buffer';
import { createReadStream } from 'node:fs';
import type { Readable } from 'node:stream';
import ZipStream from 'zip-stream';

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
  private readonly zip = new ZipStream({
    zlib: { level: zlib.constants.Z_BEST_SPEED },
  });

  private readonly entries: Array<{
    source: () => Buffer | Readable | string;
    meta: ZipEntryMeta;
  }> = [];

  addEntry(
    contents: Buffer | Readable | string | Uint8Array,
    meta: ZipEntryMeta
  ): void {
    const resolvedContents =
      contents instanceof Uint8Array && !Buffer.isBuffer(contents)
        ? Buffer.from(contents.buffer, contents.byteOffset, contents.byteLength)
        : contents;
    this.entries.push({ source: () => resolvedContents, meta });
  }

  addEntryFromPath(filePath: string, meta: ZipEntryMeta): void {
    this.entries.push({ source: () => createReadStream(filePath), meta });
  }

  finalize(): Readable {
    void this.writeEntries().catch((error) => {
      this.zip.destroy(error);
    });
    return this.zip as unknown as Readable;
  }

  private async writeEntries(): Promise<void> {
    for (const { source, meta } of this.entries) {
      await new Promise<void>((resolve, reject) => {
        this.zip.entry(
          source(),
          {
            name: meta.name,
            date: FIXED_ZIP_DATE,
            mode: FIXED_ZIP_FILE_MODE,
            store: !meta.compress,
          },
          (error) => (error ? reject(error) : resolve())
        );
      });
    }
    this.zip.finalize();
  }
}

export interface ZipEntryMeta {
  compress?: boolean;
  name: string;
}
