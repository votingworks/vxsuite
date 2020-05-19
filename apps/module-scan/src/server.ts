//
// Just the HTTP glue to the functionality, no implementations.
// All actual implementations are in importer.ts and scanner.ts
//

import express, {
  Application,
  Request,
  Response,
  RequestHandler,
} from 'express'
import multer from 'multer'
import * as path from 'path'
import { Election } from '@votingworks/ballot-encoder'

import SystemImporter, { Importer } from './importer'
import makeTemporaryBallotImportImageDirectories from './makeTemporaryBallotImportImageDirectories'
import Store from './store'
import { FujitsuScanner, Scanner } from './scanner'
import pdfToImages from './util/pdfToImages'

export interface AppOptions {
  store: Store
  importer: Importer
}

/**
 * Builds an express application, using `store` and `importer` to do the heavy
 * lifting.
 */
export function buildApp({ store, importer }: AppOptions): Application {
  const app: Application = express()
  const upload = multer({ storage: multer.memoryStorage() })

  app.use(express.json())

  app.post('/scan/configure', (request: Request, response: Response) => {
    // store the election file
    const election = request.body as Election
    importer.configure(election)
    response.json({ status: 'ok' })
  })

  app.post('/scan/scanBatch', async (_request, response) => {
    try {
      await importer.doImport()
      response.json({ status: 'ok' })
    } catch (err) {
      response.json({ status: `could not scan ${err.message}` })
    }
  })

  app.post('/scan/invalidateBatch', (_request, response) => {
    response.json({ status: 'ok' })
  })

  app.post('/scan/addManualBallot', async (request, response) => {
    const { ballotString } = request.body
    await importer.addManualBallot(new TextEncoder().encode(ballotString))
    response.json({ status: 'ok' })
  })

  async function addHmpbTemplates(
    files: Express.Multer.File[],
    response: Response
  ): Promise<void> {
    for (const file of files) {
      if (file.mimetype !== 'application/pdf') {
        response.status(400)
        response.json({
          errors: [
            {
              type: 'invalid-template-file-type',
              message: `File upload expected to be application/pdf, got: ${file.mimetype}`,
            },
          ],
        })
        return
      }

      let page = 0
      for await (const image of pdfToImages(file.buffer, { scale: 2 })) {
        try {
          page += 1
          await importer.addHmpbTemplate(image)
        } catch (error) {
          response.status(400)
          response.json({
            errors: [
              {
                type: 'invalid-template-file-image',
                message: `Ballot image on page ${page} of file '${file.filename}' could not be interpreted as a template: ${error}`,
              },
            ],
          })
          return
        }
      }
    }
  }

  app.post(
    '/scan/hmpb/addTemplates',
    upload.array('ballots') as RequestHandler,
    async (request, response) => {
      try {
        await addHmpbTemplates(request.files as Express.Multer.File[], response)
        response.json({ status: 'ok' })
      } catch (error) {
        response.status(500)
        response.json({
          errors: [
            {
              type: 'internal-server-error',
              message: error.message,
            },
          ],
        })
      }
    }
  )

  app.post('/scan/export', async (_request, response) => {
    const cvrs = await importer.doExport()
    response.set('Content-Type', 'text/plain')
    response.send(cvrs)
  })

  app.get('/scan/status', async (_request, response) => {
    const status = await importer.getStatus()
    response.json(status)
  })

  app.delete('/scan/batch/:batchId', async (request, response) => {
    if (await store.deleteBatch(parseInt(request.params.batchId, 10))) {
      response.json({ status: 'ok' })
    } else {
      response.status(404).end()
    }
  })

  app.post('/scan/zero', async (_request, response) => {
    await importer.doZero()
    response.json({ status: 'ok' })
  })

  app.post('/scan/unconfigure', async (_request, response) => {
    await importer.unconfigure()
    response.json({ status: 'ok' })
  })

  app.get('/', (_request, response) => {
    response.sendFile(path.join(__dirname, '..', 'index.html'))
  })

  return app
}

export interface StartOptions {
  port: number | string
  store: Store
  scanner: Scanner
  importer: SystemImporter
  app: Application
}

/**
 * Starts the server with all the default options.
 */
export async function start({
  port = process.env.PORT || 3002,
  store = new Store(path.join(__dirname, '..', 'cvrs.db')),
  scanner = new FujitsuScanner(),
  importer = new SystemImporter({
    store,
    scanner,
    ...makeTemporaryBallotImportImageDirectories().paths,
  }),
  app = buildApp({ importer, store }),
}: Partial<StartOptions> = {}): Promise<void> {
  await store.init()
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Listening at http://localhost:${port}/`)
    console.log(`Scanning ballots into ${importer.ballotImagesPath}`)
  })
}
