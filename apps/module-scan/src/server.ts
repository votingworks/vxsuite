//
// Just the HTTP glue to the functionality, no implementations.
// All actual implementations are in scanner.ts
//

import express, { Application, Request, Response } from 'express'
import * as path from 'path'
import {
  addManualBallot,
  configure,
  doScan,
  doExport,
  getStatus,
  doZero,
  unconfigure,
} from './scanner'

import * as store from './store'

import { Election } from './types'

export const app: Application = express()
const port = 3002

app.use(express.json())

app.post('/scan/configure', (request: Request, response: Response) => {
  // store the election file
  const election = request.body as Election
  configure(election)
  response.json({ status: 'ok' })
})

app.post('/scan/scanBatch', (_request: Request, response: Response) => {
  doScan()
    .then(() => {
      response.json({ status: 'ok' })
    })
    .catch(err => {
      response.json({ status: `could not scan ${err}` })
    })
})

app.post('/scan/invalidateBatch', (_request: Request, response: Response) => {
  response.json({ status: 'ok' })
})

app.post('/scan/addManualBallot', (request: Request, response: Response) => {
  const { ballotString } = request.body
  addManualBallot(ballotString).then(() => {
    response.json({ status: 'ok' })
  })
})

app.post('/scan/export', (_request: Request, response: Response) => {
  doExport().then(cvrs => {
    response.set('Content-Type', 'text/plain')
    response.send(cvrs)
  })
})

app.get('/scan/status', (_request: Request, response: Response) => {
  getStatus().then(status => {
    response.json(status)
  })
})

app.post('/scan/zero', (_request: Request, response: Response) => {
  doZero().then(() => {
    response.json({ status: 'ok' })
  })
})

app.post('/scan/unconfigure', (_request: Request, response: Response) => {
  unconfigure().then(() => {
    response.json({ status: 'ok' })
  })
})

app.get('/', (_request: Request, response: Response) => {
  response.sendFile(path.join(__dirname, '..', 'index.html'))
})

export function start() {
  store.init().then(() => {
    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`Listening at http://localhost:${port}/`)
    })
  })
}
