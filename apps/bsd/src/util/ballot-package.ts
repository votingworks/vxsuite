import {
  BallotStyle,
  Contest,
  Election,
  parseElection,
  Precinct,
} from '@votingworks/types'
import type { BallotLocales } from '@votingworks/hmpb-interpreter'
import 'fast-text-encoding'
import { Entry, fromBuffer, ZipFile } from 'yauzl'
import { sha256 } from 'js-sha256'

export interface BallotPackage {
  electionDefinition: ElectionDefinition
  ballots: BallotPackageEntry[]
}

export interface ElectionDefinition {
  election: Election
  electionData: string
  electionHash: string
}

export interface BallotPackageEntry {
  pdf: Buffer
  ballotConfig: BallotConfig
}

export interface BallotPackageManifest {
  ballots: readonly BallotConfig[]
}

export interface BallotStyleData {
  ballotStyleId: BallotStyle['id']
  contestIds: Contest['id'][]
  precinctId: Precinct['id']
}

export interface BallotConfig extends BallotStyleData {
  filename: string
  locales: BallotLocales
  isLiveMode: boolean
}

function readFile(file: File): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onerror = () => {
      /* istanbul ignore next */
      reject(reader.error)
    }

    reader.onload = () => {
      resolve(Buffer.from(reader.result as ArrayBuffer))
    }

    reader.readAsArrayBuffer(file)
  })
}

function openZip(data: Uint8Array): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    fromBuffer(
      Buffer.from(data),
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
  return new TextDecoder().decode(bytes)
}

async function readJSONEntry<T>(zipfile: ZipFile, entry: Entry): Promise<T> {
  return JSON.parse(await readTextEntry(zipfile, entry))
}

async function readBallotPackageFromZip(
  zipfile: ZipFile,
  fileName: string,
  fileSize: number
): Promise<BallotPackage> {
  const entries = await getEntries(zipfile)
  const electionEntry = entries.find(
    (entry) => entry.fileName === 'election.json'
  )
  const manifestEntry = entries.find(
    (entry) => entry.fileName === 'manifest.json'
  )

  if (!electionEntry) {
    throw new Error(
      `ballot package does not have a file called 'election.json': ${fileName} (size=${fileSize})`
    )
  }

  if (!manifestEntry) {
    throw new Error(
      `ballot package does not have a file called 'manifest.json': ${fileName} (size=${fileSize})`
    )
  }

  const electionData = await readTextEntry(zipfile, electionEntry)
  const manifest: BallotPackageManifest = await readJSONEntry(
    zipfile,
    manifestEntry
  )
  const ballots: BallotPackageEntry[] = []

  for (const entry of entries) {
    const ballotConfig = manifest.ballots.find(
      (b) => b.filename === entry.fileName
    )

    if (ballotConfig) {
      ballots.push({
        ballotConfig,
        pdf: await readEntry(zipfile, entry),
      })
    }
  }

  if (ballots.length !== manifest.ballots.length) {
    throw new Error(
      `ballot package is malformed; found ${ballots.length} file(s) matching entries in the manifest ('manifest.json'), but the manifest has ${manifest.ballots.length}. perhaps this ballot package is using a different version of the software?`
    )
  }

  return {
    electionDefinition: {
      election: parseElection(JSON.parse(electionData)),
      electionData,
      electionHash: sha256(electionData),
    },
    ballots,
  }
}

export async function readBallotPackageFromFile(
  file: File
): Promise<BallotPackage> {
  const zipFile = await openZip(await readFile(file))
  return readBallotPackageFromZip(zipFile, file.name, file.size)
}

export async function readBallotPackageFromFilePointer(
  file: KioskBrowser.FileSystemEntry
): Promise<BallotPackage> {
  const zipFile = await openZip(await window.kiosk!.readFile(file.path))
  return readBallotPackageFromZip(zipFile, file.name, file.size)
}
