import { Buffer } from 'buffer';
import makeDebug from 'debug';
import { createReadStream, existsSync } from 'fs-extra';
import { WritableStream } from 'memory-streams';
import { basename } from 'path';
import Database from 'better-sqlite3';
import { fileSync } from 'tmp';
import ZipStream from 'zip-stream';
import { FULL_LOG_PATH } from '@votingworks/logging';
import { throwIllegalValue } from '@votingworks/utils';
import { Store } from './store';

const debug = makeDebug('scan:backup');

/**
 * Specifies what to include in the backup
 *
 * @property scanImagesToInclude Specifies which scan images to include in the backup
 */
export interface BackupOptions {
  scanImagesToInclude: 'all' | 'normalizedOnly' | 'originalOnly';
}

const defaultBackupOptions: BackupOptions = {
  scanImagesToInclude: 'all',
};

/**
 * Parses a query param as a BackupOptions['scanImagesToInclude']
 */
export function parseScanImagesToIncludeQueryParam(
  param: qs.ParsedQs[string]
): BackupOptions['scanImagesToInclude'] {
  switch (param) {
    case 'all':
      return 'all';
    case 'normalizedOnly':
      return 'normalizedOnly';
    case 'originalOnly':
      return 'originalOnly';
    default:
      return defaultBackupOptions.scanImagesToInclude;
  }
}

/**
 * Creates a backup of the database and all scanned files.
 */
export class Backup {
  private readonly entries = new Set<string>();

  constructor(private readonly zip: ZipStream, private readonly store: Store) {}

  /**
   * Add an entry to the zip file from a static or stream data source.
   *
   * @param name the path of the file inside the zip file
   */
  async addEntry(
    name: string,
    data: string | Buffer | NodeJS.ReadableStream
  ): Promise<void> {
    if (this.entries.has(name)) {
      return;
    }
    this.entries.add(name);

    debug('adding %s to backup archive', name);
    await new Promise((resolve, reject) =>
      this.zip.entry(data, { name }, (error, entry) => {
        if (error) {
          reject(error);
        } else {
          resolve(entry);
        }
      })
    );
  }

  /**
   * Adds an entry to the zip file from a file on disk.
   *
   * @param filepath the path to the file to add
   * @param name the path of the file inside the zip file
   */
  async addFileEntry(
    filepath: string,
    name = basename(filepath)
  ): Promise<void> {
    await this.addEntry(name, createReadStream(filepath));
  }

  /**
   * Runs the backup.
   */
  async backup(options: BackupOptions = defaultBackupOptions): Promise<void> {
    debug('starting a backup');

    const electionDefinition = this.store.getElectionDefinition();

    if (!electionDefinition) {
      throw new Error('cannot backup without election configuration');
    }

    await this.addEntry('election.json', electionDefinition.electionData);

    const cvrStream = new WritableStream();
    this.store.exportCvrs(cvrStream);
    await this.addEntry('cvrs.jsonl', cvrStream.toBuffer());

    const dbBackupFile = fileSync();
    this.store.backup(dbBackupFile.name);
    await this.rewriteFilePaths(dbBackupFile.name);
    await this.addFileEntry(dbBackupFile.name, 'ballots.db');
    await this.addEntry('ballots.db.digest', Store.getSchemaDigest());
    dbBackupFile.removeCallback();

    for (const sheet of this.store.getSheets()) {
      if (options.scanImagesToInclude === 'all') {
        await this.addFileEntry(sheet.front.original);
        await this.addFileEntry(sheet.front.normalized);
        await this.addFileEntry(sheet.back.original);
        await this.addFileEntry(sheet.back.normalized);
      } else if (options.scanImagesToInclude === 'normalizedOnly') {
        await this.addFileEntry(sheet.front.normalized);
        await this.addFileEntry(sheet.back.normalized);
      } else if (options.scanImagesToInclude === 'originalOnly') {
        await this.addFileEntry(sheet.front.original);
        await this.addFileEntry(sheet.back.original);
      } else {
        /* istanbul ignore next */
        throwIllegalValue(options.scanImagesToInclude);
      }
    }

    if (existsSync(FULL_LOG_PATH)) {
      await this.addFileEntry(FULL_LOG_PATH);
    }

    this.zip.finalize();
  }

  /**
   * Rewrites file paths in the database to contain only the basename without
   * any intermediate directories. We do this because otherwise they're absolute
   * paths and don't map well to the unzipped files.
   */
  private async rewriteFilePaths(dbPath: string): Promise<void> {
    const db = new Database(dbPath);
    const selectSheets = db.prepare<[]>(`
      select
        id,
        front_original_filename,
        front_normalized_filename,
        back_original_filename,
        back_normalized_filename
      from sheets
      `);
    const updateSheet = db.prepare<[string, string, string, string, string]>(
      `
      update sheets
      set front_original_filename = ?,
          front_normalized_filename = ?,
          back_original_filename = ?,
          back_normalized_filename = ?
      where id = ?
      `
    );

    const updates: Array<Promise<void>> = [];
    for (const row of selectSheets.all()) {
      updateSheet.run(
        basename(row.front_original_filename),
        basename(row.front_normalized_filename),
        basename(row.back_original_filename),
        basename(row.back_normalized_filename),
        row.id
      );
    }

    await Promise.all(updates);
  }
}

/**
 * Backs up the store and all referenced files into a zip archive.
 */
export function backup(
  store: Store,
  options: BackupOptions = defaultBackupOptions
): NodeJS.ReadableStream {
  const zip = new ZipStream();

  process.nextTick(() => {
    new Backup(zip, store).backup(options).catch((error) => {
      zip.emit('error', error);
      zip.destroy();
    });
  });

  return zip;
}
