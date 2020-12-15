import makeDebug from 'debug'
import { createReadStream } from 'fs-extra'
import { WritableStream } from 'memory-streams'
import { basename } from 'path'
import { Database } from 'sqlite3'
import { fileSync } from 'tmp'
import ZipStream from 'zip-stream'
import Store from './store'

const debug = makeDebug('module-scan:backup')

/**
 * Creates a backup of the database and all scanned files.
 */
export class Backup {
  private readonly entries = new Set<string>()

  public constructor(
    private readonly zip: ZipStream,
    private readonly store: Store
  ) {}

  /**
   * Add an entry to the zip file from a static or stream data source.
   *
   * @param name the path of the file inside the zip file
   */
  public async addEntry(
    name: string,
    data: string | Buffer | NodeJS.ReadableStream
  ): Promise<void> {
    if (this.entries.has(name)) {
      return
    }
    this.entries.add(name)

    debug('adding %s to backup archive', name)
    await new Promise((resolve, reject) =>
      this.zip.entry(data, { name }, (error, entry) => {
        if (error) {
          reject(error)
        } else {
          resolve(entry)
        }
      })
    )
  }

  /**
   * Adds an entry to the zip file from a file on disk.
   *
   * @param filepath the path to the file to add
   * @param name the path of the file inside the zip file
   */
  public async addFileEntry(
    filepath: string,
    name = basename(filepath)
  ): Promise<void> {
    await this.addEntry(name, createReadStream(filepath))
  }

  /**
   * Runs the backup.
   */
  public async backup(): Promise<void> {
    debug('starting a backup')

    const electionDefinition = await this.store.getElectionDefinition()

    if (!electionDefinition) {
      throw new Error('cannot backup without election configuration')
    }

    await this.addEntry('election.json', electionDefinition.electionData)

    const cvrStream = new WritableStream()
    await this.store.exportCVRs(cvrStream)
    await this.addEntry('cvrs.jsonl', cvrStream.toBuffer())

    const dbBackupFile = fileSync()
    await this.store.backup(dbBackupFile.name)
    await this.rewriteFilePaths(dbBackupFile.name)
    await this.addFileEntry(dbBackupFile.name, 'ballots.db')
    await this.addEntry('ballots.db.digest', await Store.getSchemaDigest())
    dbBackupFile.removeCallback()

    for await (const sheet of this.store.getSheets()) {
      await this.addFileEntry(sheet.front.original)
      await this.addFileEntry(sheet.front.normalized)
      await this.addFileEntry(sheet.back.original)
      await this.addFileEntry(sheet.back.normalized)
    }

    this.zip.finalize()
  }

  /**
   * Rewrites file paths in the database to contain only the basename without
   * any intermediate directories. We do this because otherwise they're absolute
   * paths and don't map well to the unzipped files.
   */
  private async rewriteFilePaths(dbPath: string): Promise<void> {
    const db = await new Promise<Database>((resolve, reject) => {
      const db = new Database(dbPath, (error) => {
        if (error) {
          reject(error)
        } else {
          resolve(db)
        }
      })
    })

    const updates: Promise<void>[] = []
    await new Promise<void>((resolve, reject) => {
      db.each(
        `
        select
          id,
          front_original_filename,
          front_normalized_filename,
          back_original_filename,
          back_normalized_filename
        from sheets
      `,
        (error, row) => {
          if (error) {
            reject(error)
          } else {
            updates.push(
              new Promise((resolve, reject) =>
                db.run(
                  `
            update sheets
            set front_original_filename = ?,
                front_normalized_filename = ?,
                back_original_filename = ?,
                back_normalized_filename = ?
            where id = ?
          `,
                  [
                    basename(row.front_original_filename),
                    basename(row.front_normalized_filename),
                    basename(row.back_original_filename),
                    basename(row.back_normalized_filename),
                    row.id,
                  ],
                  (error) => {
                    if (error) {
                      reject(error)
                    } else {
                      resolve()
                    }
                  }
                )
              )
            )
          }
        },
        (error) => {
          if (error) {
            reject(error)
          } else {
            resolve()
          }
        }
      )
    })

    await Promise.all(updates)
  }
}

/**
 * Backs up the store and all referenced files into a zip archive.
 */
export default function backup(store: Store): NodeJS.ReadableStream {
  const zip = new ZipStream()

  process.nextTick(() => {
    new Backup(zip, store).backup().catch((error) => {
      zip.emit('error', error)
      zip.destroy()
    })
  })

  return zip
}
