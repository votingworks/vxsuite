import { writeFile } from 'fs-extra'
import { WritableStream } from 'memory-streams'
import { basename } from 'path'
import { Database } from 'sqlite3'
import { fileSync } from 'tmp'
import { Entry, fromBuffer, ZipFile } from 'yauzl'
import ZipStream from 'zip-stream'
import election from '../test/fixtures/2020-choctaw/election'
import backup, { Backup } from './backup'
import Store from './store'
import { fromElection } from './util/electionDefinition'
import { BallotType } from '@votingworks/ballot-encoder'

function getEntries(zipfile: ZipFile): Promise<Entry[]> {
  return new Promise((resolve, reject) => {
    const entries: Entry[] = []

    zipfile
      .on('entry', (entry: Entry) => {
        entries.push(entry)
        zipfile.readEntry()
      })
      .on('end', () => {
        resolve(entries)
      })
      .on('error', (error) => {
        /* istanbul ignore next */
        reject(error)
      })
      .readEntry()
  })
}

function openZip(data: Buffer): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    fromBuffer(
      data,
      { lazyEntries: true, validateEntrySizes: true },
      (error, zipfile) => {
        if (error || !zipfile) {
          reject(error)
        } else {
          resolve(zipfile)
        }
      }
    )
  })
}

async function readEntry(zipfile: ZipFile, entry: Entry): Promise<Buffer> {
  const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
    zipfile.openReadStream(entry, (error, value) => {
      /* istanbul ignore else */
      if (!error && value) {
        resolve(value)
      } else {
        reject(error)
      }
    })
  })

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream
      .on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })
      .on('end', () => {
        resolve(Buffer.concat(chunks))
      })
      .on('error', (error) => {
        /* istanbul ignore next */
        reject(error)
      })
  })
}

async function readTextEntry(zipfile: ZipFile, entry: Entry): Promise<string> {
  const bytes = await readEntry(zipfile, entry)
  const string = new TextDecoder().decode(bytes)
  return string
}

async function readJSONEntry<T>(zipfile: ZipFile, entry: Entry): Promise<T> {
  return JSON.parse(await readTextEntry(zipfile, entry))
}

test('unconfigured', async () => {
  const store = await Store.memoryStore()

  await expect(
    new Promise((resolve, reject) => {
      backup(store).on('error', reject).on('close', resolve)
    })
  ).rejects.toThrowError('cannot backup without election configuration')
})

test('configured', async () => {
  const store = await Store.memoryStore()
  await store.setElection(fromElection(election))
  const result = new WritableStream()
  const onError = jest.fn()

  await new Promise((resolve) => {
    backup(store).on('error', onError).pipe(result).on('finish', resolve)
  })

  expect(onError).not.toHaveBeenCalled()
})

test('zip entry fails', async () => {
  const store = await Store.memoryStore()
  const zip = new ZipStream()
  const backup = new Backup(zip, store)

  jest.spyOn(zip, 'entry').mockImplementationOnce(
    (_data, _opts, callback): ZipStream => {
      callback(new Error('oh no'))
      return zip
    }
  )

  await expect(
    backup.addEntry('readme.txt', 'look it up')
  ).rejects.toThrowError('oh no')
})

test('has election.json', async () => {
  const store = await Store.memoryStore()
  await store.setElection(fromElection(election))
  const result = new WritableStream()

  await new Promise((resolve, reject) => {
    backup(store).on('error', reject).pipe(result).on('finish', resolve)
  })

  const zipfile = await openZip(result.toBuffer())
  const entries = await getEntries(zipfile)
  const electionEntry = entries.find(
    ({ fileName }) => fileName === 'election.json'
  )!
  expect(await readJSONEntry(zipfile, electionEntry)).toEqual(election)
})

test('has ballots.db', async () => {
  const store = await Store.memoryStore()
  const electionDefinition = fromElection(election)
  await store.setElection(electionDefinition)
  const result = new WritableStream()

  await new Promise((resolve, reject) => {
    backup(store).on('error', reject).pipe(result).on('finish', resolve)
  })

  const zipfile = await openZip(result.toBuffer())
  const entries = await getEntries(zipfile)
  expect(entries.map((entry) => entry.fileName)).toContain('ballots.db')

  const dbEntry = entries.find((entry) => entry.fileName === 'ballots.db')
  const dbFile = fileSync()
  await writeFile(dbFile.fd, await readEntry(zipfile, dbEntry!))
  const db = await new Promise<Database>((resolve, reject) => {
    const db = new Database(dbFile.name, (error) => {
      if (error) {
        reject(error)
      } else {
        resolve(db)
      }
    })
  })
  const row = await new Promise<{ value: string }>((resolve, reject) => {
    db.get(
      'select value from configs where key = ?',
      ['election'],
      (error, row) => {
        if (error) {
          reject(error)
        } else {
          resolve(row)
        }
      }
    )
  })
  expect(JSON.parse(row.value)).toEqual(electionDefinition)
})

test('has all files referenced in the database', async () => {
  const store = await Store.memoryStore()
  const electionDefinition = fromElection(election)
  await store.setElection(electionDefinition)
  const batchId = await store.addBatch()

  const frontOriginalFile = fileSync()
  await writeFile(frontOriginalFile.fd, 'front original')

  const frontNormalizedFile = fileSync()
  await writeFile(frontNormalizedFile.fd, 'front normalized')

  const backOriginalFile = fileSync()
  await writeFile(backOriginalFile.fd, 'back original')

  await store.addSheet('sheet-1', batchId, [
    {
      interpretation: { type: 'UnreadablePage' },
      originalFilename: frontOriginalFile.name,
      normalizedFilename: frontNormalizedFile.name,
    },
    {
      interpretation: { type: 'UnreadablePage' },
      // intentionally the same, for cases where that's true
      originalFilename: backOriginalFile.name,
      normalizedFilename: backOriginalFile.name,
    },
  ])

  const result = new WritableStream()

  await new Promise((resolve, reject) => {
    backup(store).on('error', reject).pipe(result).on('finish', resolve)
  })

  const zipfile = await openZip(result.toBuffer())
  const entries = await getEntries(zipfile)

  expect(
    entries
      .map((entry) => entry.fileName)
      .filter(
        (fileName) =>
          fileName !== 'election.json' &&
          fileName !== 'ballots.db' &&
          fileName !== 'ballots.db.digest' &&
          fileName !== 'cvrs.jsonl'
      )
      .sort()
  ).toEqual(
    [frontOriginalFile.name, frontNormalizedFile.name, backOriginalFile.name]
      .map((name) => basename(name))
      .sort()
  )

  for (const [{ name }, content] of [
    [frontOriginalFile, 'front original'],
    [frontNormalizedFile, 'front normalized'],
    [backOriginalFile, 'back original'],
  ] as const) {
    expect(
      new TextDecoder().decode(
        await readEntry(
          zipfile,
          entries.find((entry) => entry.fileName === basename(name))!
        )
      )
    ).toEqual(content)
  }

  const dbEntry = entries.find((entry) => entry.fileName === 'ballots.db')
  const dbFile = fileSync()
  await writeFile(dbFile.fd, await readEntry(zipfile, dbEntry!))
  const db = await new Promise<Database>((resolve, reject) => {
    const db = new Database(dbFile.name, (error) => {
      if (error) {
        reject(error)
      } else {
        resolve(db)
      }
    })
  })
  const row = await new Promise<{ filename: string }>((resolve, reject) => {
    db.get(
      'select front_original_filename as filename from sheets',
      (error, row) => {
        if (error) {
          reject(error)
        } else {
          resolve(row)
        }
      }
    )
  })
  expect(row).toEqual({
    filename: basename(frontOriginalFile.name),
  })
})

test('has cvrs.jsonl', async () => {
  const store = await Store.memoryStore()
  await store.setElection(fromElection(election))
  const result = new WritableStream()

  const batchId = await store.addBatch()
  const imageFile = fileSync()
  await writeFile(imageFile.fd, 'front original')
  await store.addSheet('sheet-1', batchId, [
    {
      interpretation: {
        type: 'InterpretedBmdPage',
        ballotId: 'abc',
        metadata: {
          ballotStyleId: '1',
          precinctId: '6522',
          ballotType: BallotType.Standard,
          electionHash: '',
          isTestMode: false,
          locales: { primary: 'en-US' },
        },
        votes: {
          'flag-question': ['yes'],
        },
      },
      originalFilename: imageFile.name,
      normalizedFilename: imageFile.name,
    },
    {
      interpretation: { type: 'BlankPage' },
      originalFilename: imageFile.name,
      normalizedFilename: imageFile.name,
    },
  ])

  await new Promise((resolve, reject) => {
    backup(store).on('error', reject).pipe(result).on('finish', resolve)
  })

  const zipfile = await openZip(result.toBuffer())
  const entries = await getEntries(zipfile)
  expect(entries.map(({ fileName }) => fileName)).toContain('cvrs.jsonl')

  const cvrsEntry = entries.find(({ fileName }) => fileName === 'cvrs.jsonl')!
  expect(await readTextEntry(zipfile, cvrsEntry)).toMatchInlineSnapshot(`
    "{\\"1\\":[],\\"2\\":[],\\"3\\":[],\\"4\\":[],\\"_ballotId\\":\\"abc\\",\\"_ballotStyleId\\":\\"1\\",\\"_ballotType\\":\\"standard\\",\\"_precinctId\\":\\"6522\\",\\"_scannerId\\":\\"000\\",\\"_testBallot\\":false,\\"_locales\\":{\\"primary\\":\\"en-US\\"},\\"initiative-65\\":[],\\"initiative-65-a\\":[],\\"flag-question\\":[\\"yes\\"],\\"runoffs-question\\":[]}
    "
  `)
})
