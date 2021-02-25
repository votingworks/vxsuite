import { Election } from '@votingworks/types'
import makeDebug from 'debug'
import { readFile } from 'fs-extra'
import { basename, extname, join } from 'path'
import { performance } from 'perf_hooks'
import { saveImages } from '../importer'
import Interpreter, { PageInterpretation } from '../interpreter'
import Store from '../store'
import { BallotPageQrcode } from '../types'
import pdfToImages from '../util/pdfToImages'

const debug = makeDebug(`module-scan:worker(pid=${process.pid}):interpret`)

export const workerPath = __filename

export type Input =
  | { action: 'configure'; dbPath: string }
  | {
      action: 'interpret'
      sheetId: string
      imagePath: string
      ballotImagesPath: string
      qrcode?: BallotPageQrcode
    }

export interface InterpretOutput {
  interpretation: PageInterpretation
  originalFilename: string
  normalizedFilename: string
}

export type Output = InterpretOutput | void

export let interpreter: Interpreter | undefined

async function getElection(store: Store): Promise<Election | undefined> {
  const electionDefinition = await store.getElectionDefinition()
  return electionDefinition?.election
}

/**
 * Reads election configuration from the database.
 */
export async function configure(store: Store): Promise<void> {
  interpreter = undefined

  debug('configuring from %s', store.dbPath)
  const election = await getElection(store)

  if (!election) {
    debug('no election configured')
    return
  }

  debug('election: %o', election.title)
  const templates = await store.getHmpbTemplates()

  debug('creating a new interpreter')
  interpreter = new Interpreter(election, await store.getTestMode())

  debug('hand-marked paper ballot templates: %d', templates.length)
  for (const [i, [pdf, layouts]] of templates.entries()) {
    debug('processing pdf #%d', i)
    for await (const { page, pageNumber } of pdfToImages(pdf, { scale: 2 })) {
      debug('processing pdf #%d p%d', i, pageNumber)
      const layout = layouts[pageNumber - 1]
      await interpreter.addHmpbTemplate({
        ...layout,
        ballotImage: {
          ...layout.ballotImage,
          imageData: page,
        },
      })
    }
  }
}

export async function interpret(
  ballotImagePath: string,
  sheetId: string,
  ballotImagesPath: string,
  ballotPageQrcode?: BallotPageQrcode
): Promise<InterpretOutput> {
  debug('interpret ballot image: %s', ballotImagePath)
  if (!interpreter) {
    throw new Error('cannot interpret ballot with no configured election')
  }

  const ballotImageFile = await readFile(ballotImagePath)
  performance.mark('interpret start')
  const result = await interpreter.interpretFile({
    ballotImagePath,
    ballotImageFile,
    ballotPageQrcode,
  })
  performance.mark('interpret end')
  performance.measure('interpret', 'interpret start', 'interpret end')
  debug(
    'interpreted ballot image as %s: %s',
    result.interpretation.type,
    ballotImagePath
  )
  const ext = extname(ballotImagePath)
  const originalImagePath = join(
    ballotImagesPath,
    `${basename(ballotImagePath, ext)}-${sheetId}-original${ext}`
  )
  const normalizedImagePath = join(
    ballotImagesPath,
    `${basename(ballotImagePath, ext)}-${sheetId}-normalized${ext}`
  )
  debug('saving images for ballot image: %s', ballotImagePath)
  performance.mark('save ballot images start')
  const images = await saveImages(
    ballotImagePath,
    originalImagePath,
    normalizedImagePath,
    result.normalizedImage
  )
  performance.mark('save ballot images end')
  performance.measure(
    'save ballot images',
    'save ballot images start',
    'save ballot images end'
  )
  debug('returning from worker for ballot image: %s', ballotImagePath)
  return {
    interpretation: result.interpretation,
    originalFilename: images.original,
    normalizedFilename: images.normalized,
  }
}

export async function call(input: Input): Promise<Output> {
  switch (input.action) {
    case 'configure': {
      const store = await Store.fileStore(input.dbPath)
      return await configure(store)
    }

    case 'interpret':
      return await interpret(
        input.imagePath,
        input.sheetId,
        input.ballotImagesPath,
        input.qrcode
      )
  }
}
