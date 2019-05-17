//
// Just the HTTP glue to the functionality, no implementations.
// All actual implementations are in scanner.ts
//

import express, { Application, Request, Response } from 'express'
import * as path from 'path'
import {
  configure,
  doScan,
  doExport,
  getStatus,
  doZero,
  shutdown,
} from './scanner'
import * as store from './store'

import { Election } from './types'

// for now, we reset on every start
store.reset()

export const app: Application = express()
const port = 3002

app.use(express.json())

app.post('/scan/configure', (request: Request, response: Response) => {
  // store the election file
  const election = request.body as Election
  configure(election)
  response.json({ status: 'ok' })
})

app.post('/scan/scan', (_request: Request, response: Response) => {
  doScan()
  response.json({ status: 'ok' })
})

app.post('/scan/export', (_request: Request, response: Response) => {
  doExport(function(result: string) {
    response.set('Content-Type', 'text/plain')
    response.send(result)
  })
})

app.get('/scan/status', (_request: Request, response: Response) => {
  response.json(getStatus())
})

app.post('/scan/zero', (_request: Request, response: Response) => {
  doZero()
  response.json({ status: 'ok' })
})

app.post('/scan/unconfigure', (_request: Request, response: Response) => {
  shutdown()
  response.json({ status: 'ok' })
})

app.get('/', (_request: Request, response: Response) => {
  response.sendFile(path.join(__dirname, '..', 'index.html'))
})

export function start() {
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Listening at http://localhost:${port}/`)
  })
}
