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

app.post('/scan/scanBatch', async (_request, response) => {
  try {
    await doScan()
    response.json({ status: 'ok' })
  } catch (err) {
    response.json({ status: `could not scan ${err}` })
  }
})

app.post('/scan/invalidateBatch', (_request, response) => {
  response.json({ status: 'ok' })
})

app.post('/scan/addManualBallot', async (request, response) => {
  const { ballotString } = request.body
  await addManualBallot(ballotString)
  response.json({ status: 'ok' })
})

app.post('/scan/export', async (_request, response) => {
  const cvrs = await doExport()
  response.set('Content-Type', 'text/plain')
  response.send(cvrs)
})

app.get('/scan/status', async (_request, response) => {
  const status = await getStatus()
  response.json(status)
})

app.post('/scan/zero', async (_request, response) => {
  await doZero()
  response.json({ status: 'ok' })
})

app.post('/scan/unconfigure', async (_request, response) => {
  await unconfigure()
  response.json({ status: 'ok' })
})

app.get('/', (_request, response) => {
  response.sendFile(path.join(__dirname, '..', 'index.html'))
})

export async function start() {
  await store.init()
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Listening at http://localhost:${port}/`)
  })
}
