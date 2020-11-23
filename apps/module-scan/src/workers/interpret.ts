import { Election } from '@votingworks/ballot-encoder'
import makeDebug from 'debug'
import { readFile } from 'fs-extra'
import { basename, extname, join } from 'path'
import { saveImages } from '../importer'
import SummaryBallotInterpreter, { PageInterpretation } from '../interpreter'
import Store from '../store'
import pdfToImages from '../util/pdfToImages'

const debug = makeDebug('module-scan:worker:interpret')

export type Input =
  | { action: 'configure'; dbPath: string }
  | {
      action: 'interpret'
      sheetId: string
      imagePath: string
      importedImagesPath: string
    }

export interface InterpretOutput {
  interpretation: PageInterpretation
  originalFilename: string
  normalizedFilename: string
}

export type Output = InterpretOutput | void

export let interpreter: SummaryBallotInterpreter | undefined

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
  interpreter = new SummaryBallotInterpreter(
    election,
    await store.getTestMode()
  )

  debug('hand-marked paper ballot templates: %d', templates.length)
  for (const [pdf, layouts] of templates) {
    for await (const { page, pageNumber } of pdfToImages(pdf, { scale: 2 })) {
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
  importedImagesPath: string
): Promise<InterpretOutput> {
  debug('interpret ballot image: %s', ballotImagePath)
  if (!interpreter) {
    throw new Error('cannot interpret ballot with no configured election')
  }

  const ballotImageFile = await readFile(ballotImagePath)
  const result = await interpreter.interpretFile({
    ballotImagePath,
    ballotImageFile,
  })
  debug(
    'interpreted ballot image as %s: %s',
    result.interpretation.type,
    ballotImagePath
  )
  const ext = extname(ballotImagePath)
  const originalImagePath = join(
    importedImagesPath,
    `${basename(ballotImagePath, ext)}-${sheetId}-original${ext}`
  )
  const normalizedImagePath = join(
    importedImagesPath,
    `${basename(ballotImagePath, ext)}-${sheetId}-normalized${ext}`
  )
  const images = await saveImages(
    ballotImagePath,
    originalImagePath,
    normalizedImagePath,
    result.normalizedImage
  )
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
        input.importedImagesPath
      )
  }
}
