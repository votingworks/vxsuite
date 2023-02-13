import { Scan } from '@votingworks/api';
import { Exporter } from '@votingworks/backend';
import { FULL_LOG_PATH } from '@votingworks/logging';
import { err } from '@votingworks/basics';
import { generateElectionBasedSubfolderName } from '@votingworks/utils';
import Database from 'better-sqlite3';
import { Buffer } from 'buffer';
import makeDebug from 'debug';
import { createReadStream, existsSync } from 'fs-extra';
import { basename } from 'path';
import { fileSync } from 'tmp';
import ZipStream from 'zip-stream';
import { exportCastVoteRecordsAsNdJson } from './cvrs/export';
import { Store } from './store';

const debug = makeDebug('scan:backup');

/**
 * Specifies what to include in the backup
 *
 * @property saveOnlyOriginalImagesThenOnlyNormalizedImagesAfterNumSheets If the number of sheets
 * scanned by the machine is less than or equal to this, only original scan images will be included
 * in the backup, and if the number of sheets scanned by the machine is greater, only normalized
 * scan images will be included in the backup. If not specified, both original and normalized scan
 * images will be included.
 */
export interface BackupOptions {
  saveOnlyOriginalImagesThenOnlyNormalizedImagesAfterNumSheets?: number;
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
    await new Promise((resolve, reject) => {
      this.zip.entry(data, { name }, (error, entry) => {
        if (error) {
          reject(error);
        } else {
          resolve(entry);
        }
      });
    });
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
  async backup({
    saveOnlyOriginalImagesThenOnlyNormalizedImagesAfterNumSheets,
  }: BackupOptions = {}): Promise<void> {
    debug('starting a backup');

    const electionDefinition = this.store.getElectionDefinition();

    if (!electionDefinition) {
      throw new Error('cannot backup without election configuration');
    }

    debug('adding election.json to backup...');
    await this.addEntry('election.json', electionDefinition.electionData);
    debug('added election.json to backup');

    debug('adding CVRs to backup...');
    await this.addEntry(
      'cvrs.jsonl',
      exportCastVoteRecordsAsNdJson({ store: this.store })
    );
    debug('added CVRs to backup');

    debug('adding database files to backup...');
    const dbBackupFile = fileSync();
    this.store.backup(dbBackupFile.name);
    await this.rewriteFilePaths(dbBackupFile.name);
    await this.addFileEntry(dbBackupFile.name, 'ballots.db');
    await this.addEntry('ballots.db.digest', Store.getSchemaDigest());
    dbBackupFile.removeCallback();
    debug('added database files to backup');

    const sheets = [];
    for (const sheet of this.store.getSheets()) {
      sheets.push(sheet);
    }
    debug('adding ballot images to backup...');
    if (
      saveOnlyOriginalImagesThenOnlyNormalizedImagesAfterNumSheets !== undefined
    ) {
      for (const sheet of sheets) {
        if (
          sheets.length <=
          saveOnlyOriginalImagesThenOnlyNormalizedImagesAfterNumSheets
        ) {
          await this.addFileEntry(sheet.front.original);
          await this.addFileEntry(sheet.back.original);
        } else {
          await this.addFileEntry(sheet.front.normalized);
          await this.addFileEntry(sheet.back.normalized);
        }
      }
    } else {
      for (const sheet of sheets) {
        await this.addFileEntry(sheet.front.original);
        await this.addFileEntry(sheet.front.normalized);
        await this.addFileEntry(sheet.back.original);
        await this.addFileEntry(sheet.back.normalized);
      }
    }
    debug('added ballot images to backup');

    if (existsSync(FULL_LOG_PATH)) {
      debug('adding logs to backup...');
      await this.addFileEntry(FULL_LOG_PATH);
      debug('added logs to backup...');
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
  options: BackupOptions = {}
): NodeJS.ReadableStream {
  const zip = new ZipStream();

  process.nextTick(() => {
    new Backup(zip, store)
      .backup(options)
      .then(() => {
        store.setScannerBackedUp();
      })
      .catch((error) => {
        zip.emit('error', error);
        zip.destroy();
      });
  });

  return zip;
}

/**
 * Back up the store and all referenced files into a zip archive on a USB drive.
 */
export async function backupToUsbDrive(
  exporter: Exporter,
  store: Store,
  options: BackupOptions = {}
): Promise<Scan.BackupResult> {
  const electionDefinition = store.getElectionDefinition();

  if (!electionDefinition) {
    return err({
      type: 'no-election',
      message: 'Cannot backup without election configuration',
    });
  }

  return await exporter.exportDataToUsbDrive(
    'scanner-backups',
    `${generateElectionBasedSubfolderName(
      electionDefinition.election,
      electionDefinition.electionHash
    )}/${new Date().toISOString().replace(/[^-a-z0-9]+/gi, '-')}-backup.zip`,
    backup(store, options)
  );
}
