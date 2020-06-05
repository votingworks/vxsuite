import 'fast-text-encoding'
import { Entry, fromBuffer, ZipFile } from 'yauzl'
import { BallotStyle, Election, Precinct } from '@votingworks/ballot-encoder'

// live/election-4e31cb1-precinct-oaklawn-branch-library-id-42-style-77.pdf
const BALLOT_PDF_FILENAME_PATTERN = /^([^/]+)\/election-(?:\w+)-precinct-(?:.+)-id-([^-]+)-style-(.+).pdf$/

export interface BallotPackage {
  election: Election
  ballots: BallotPackageEntry[]
}

export interface BallotPackageEntry {
  live: Buffer
  test: Buffer
  ballotStyle: BallotStyle
  precinct: Precinct
}

type PartialBallotPackageEntry =
  | {
      live: Buffer
      test?: Buffer
      ballotStyle: BallotStyle
      precinct: Precinct
    }
  | {
      live?: Buffer
      test: Buffer
      ballotStyle: BallotStyle
      precinct: Precinct
    }

function readFile(file: File): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onerror = () => {
      reject(reader.error)
    }

    reader.onload = () => {
      resolve(Buffer.from(reader.result as ArrayBuffer))
    }

    reader.readAsArrayBuffer(file)
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
        reject(error)
      })
      .readEntry()
  })
}

async function readEntry(zipfile: ZipFile, entry: Entry): Promise<Buffer> {
  const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
    zipfile.openReadStream(entry, (error, value) => {
      if (error || !value) {
        reject(error)
      } else {
        resolve(value)
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
        reject(error)
      })
  })
}

async function readJSONEntry<T>(zipfile: ZipFile, entry: Entry): Promise<T> {
  const bytes = await readEntry(zipfile, entry)
  const string = new TextDecoder().decode(bytes)
  return JSON.parse(string)
}

export async function readBallotPackage(file: File): Promise<BallotPackage> {
  const zipfile = await openZip(await readFile(file))
  const entries = await getEntries(zipfile)
  const electionEntry = entries.find(
    (entry) => entry.fileName === 'election.json'
  )

  if (!electionEntry) {
    throw new Error(
      `ballot package does not have a file called 'election.json': ${file.name} (size=${file.size})`
    )
  }

  const election: Election = await readJSONEntry(zipfile, electionEntry)
  const ballots: BallotPackageEntry[] = []
  const partialBallots: PartialBallotPackageEntry[] = []

  for (const entry of entries.filter(({ fileName }) =>
    fileName.endsWith('.pdf')
  )) {
    const match = entry.fileName.match(BALLOT_PDF_FILENAME_PATTERN)

    if (!match) {
      throw new Error(
        `ballot package is malformed: PDF file name does not follow the expected format: ${entry.fileName}`
      )
    }

    const [, type, precinctId, ballotStyleId] = match

    if (type !== 'live' && type !== 'test') {
      throw new Error(
        `ballot package is malformed: invalid ballot type '${type}' for ballot style id=${ballotStyleId} and precinct id=${precinctId} (${file.name})`
      )
    }

    const ballotStyle = election.ballotStyles.find(
      ({ id }) => id === ballotStyleId
    )
    const precinct = election.precincts.find(({ id }) => id === precinctId)

    if (!ballotStyle) {
      throw new Error(
        `ballot package is malformed: election configuration is missing ballot style with id=${ballotStyleId} (${file.name})`
      )
    }

    if (!precinct) {
      throw new Error(
        `ballot package is malformed: election configuration is missing precinct with id=${precinctId} (${file.name})`
      )
    }

    const ballotPDF = await readEntry(zipfile, entry)
    const partialBallotIndex = partialBallots.findIndex(
      (b) => b.ballotStyle.id === ballotStyleId && b.precinct.id === precinctId
    )

    if (partialBallotIndex >= 0) {
      const partialBallot = partialBallots[partialBallotIndex]

      switch (type) {
        case 'live':
          if (partialBallot.live) {
            throw new Error(
              `ballot package is malformed: duplicate live ballot found with ballot style id=${ballotStyleId} and precinct id=${precinctId} (${file.name})`
            )
          }
          break

        case 'test':
          if (partialBallot.test) {
            throw new Error(
              `ballot package is malformed: duplicate test ballot found with ballot style id=${ballotStyleId} and precinct id=${precinctId} (${file.name})`
            )
          }
          break

        default:
          // Already handled above when checking 'type'.
          break
      }

      ballots.push({
        ...partialBallot,
        [type]: ballotPDF,
      } as BallotPackageEntry)
      partialBallots.splice(partialBallotIndex, 1)
    } else if (type === 'live') {
      partialBallots.push({
        ballotStyle,
        precinct,
        live: ballotPDF,
      })
    } else if (type === 'test') {
      partialBallots.push({
        ballotStyle,
        precinct,
        test: ballotPDF,
      })
    }
  }

  if (partialBallots.length) {
    throw new Error(
      `ballot package is malformed: some ballots do not have both live and test types: ${partialBallots
        .map((b) => `(${b.ballotStyle.id}, ${b.precinct.id})`)
        .join(', ')}`
    )
  }

  return { election, ballots }
}
