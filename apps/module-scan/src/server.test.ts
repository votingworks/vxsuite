/* eslint-disable jest/expect-expect */

import {
  AdjudicationReason,
  CandidateContest,
  YesNoContest,
} from '@votingworks/ballot-encoder'
import { createImageData } from 'canvas'
import { Application } from 'express'
import { promises as fs } from 'fs'
import { Server } from 'http'
import { join } from 'path'
import request from 'supertest'
import EMPTY_IMAGE from '../test/fixtures/emptyImage'
import election from '../test/fixtures/state-of-hamilton/election'
import zeroRect from '../test/fixtures/zeroRect'
import { makeMockImporter } from '../test/util/mocks'
import { Importer } from './importer'
import { buildApp, start } from './server'
import Store from './store'
import { ScanStatus } from './types'
import { MarkStatus } from './types/ballot-review'

jest.mock('./importer')

let app: Application
let importer: Importer
let store: Store
let importerMock: jest.Mocked<Importer>

beforeEach(async () => {
  importer = makeMockImporter()
  importerMock = importer as jest.Mocked<Importer>
  store = await Store.memoryStore()
  await store.setElection(election)
  await store.addHmpbTemplate(Buffer.of(), [
    {
      ballotImage: {
        metadata: {
          ballotStyleId: '12',
          precinctId: '23',
          isTestBallot: false,
          pageNumber: 1,
          pageCount: 2,
          locales: { primary: 'en-US' },
        },
      },
      contests: [],
    },
    {
      ballotImage: {
        metadata: {
          ballotStyleId: '12',
          precinctId: '23',
          isTestBallot: false,
          pageNumber: 2,
          pageCount: 2,
          locales: { primary: 'en-US' },
        },
      },
      contests: [],
    },
  ])
  app = buildApp({ importer, store })
})

test('GET /scan/status', async () => {
  const status: ScanStatus = {
    batches: [],
    adjudication: { remaining: 0, adjudicated: 0 },
  }
  importerMock.getStatus.mockResolvedValue(status)
  await request(app)
    .get('/scan/status')
    .set('Accept', 'application/json')
    .expect(200, status)
  expect(importer.getStatus).toBeCalled()
})

test('GET /config', async () => {
  await store.setElection(election)
  await store.setTestMode(true)
  await request(app).get('/config').expect(200, { election, testMode: true })
})

test('PATCH /config to set election', async () => {
  await request(app)
    .patch('/config')
    .send({ election })
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
  expect(importer.configure).toBeCalledWith(
    expect.objectContaining({
      title: 'General Election',
    })
  )
})

test('PATCH /config to delete election', async () => {
  importerMock.unconfigure.mockResolvedValue()

  await request(app)
    .patch('/config')
    .send({ election: null })
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
  expect(importer.unconfigure).toBeCalled()
})

test('PATCH /config to set testMode', async () => {
  importerMock.setTestMode.mockResolvedValueOnce(undefined)

  await request(app)
    .patch('/config')
    .send({ testMode: true })
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200)

  expect(importerMock.setTestMode).toHaveBeenNthCalledWith(1, true)

  await request(app)
    .patch('/config')
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .send({ testMode: false })
    .expect(200)

  expect(importerMock.setTestMode).toHaveBeenNthCalledWith(2, false)
})

test('PATCH /config rejects unknown properties', async () => {
  await request(app)
    .patch('/config')
    .send({ nope: true })
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(400)
})

test('POST /scan/scanBatch', async () => {
  importerMock.doImport.mockResolvedValue(undefined)
  await request(app)
    .post('/scan/scanBatch')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
  expect(importer.doImport).toBeCalled()
})

test('POST /scan/scanBatch errors', async () => {
  importerMock.doImport.mockRejectedValue(new Error('scanner is a teapot'))
  await request(app)
    .post('/scan/scanBatch')
    .set('Accept', 'application/json')
    .expect(200, { status: 'could not scan: scanner is a teapot' })
  expect(importer.doImport).toBeCalled()
})

test('POST /scan/scanFiles', async () => {
  importerMock.importFile.mockResolvedValueOnce(undefined)
  await request(app)
    .post('/scan/scanFiles')
    .attach('files', Buffer.of(), {
      filename: 'ballot.jpg',
      contentType: 'image/jpeg',
    })
    .expect(200, { status: 'ok' })
})

test('POST /scan/addManualBallot', async () => {
  importerMock.addManualBallot.mockResolvedValue(undefined)
  await request(app)
    .post('/scan/addManualBallot')
    .send({
      ballotString: '12.23.1|0|0|0||||||||||||||||.r6UYR4t7hEFMz8ZlMWf1Sw',
    })
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
  expect(importer.addManualBallot).toBeCalled()
})

test('POST /scan/invalidateBatch', async () => {
  await request(app)
    .post('/scan/invalidateBatch')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
})

test('POST /scan/export', async () => {
  importerMock.doExport.mockResolvedValue('')

  await request(app)
    .post('/scan/export')
    .set('Accept', 'application/json')
    .expect(200, '')
  expect(importer.doExport).toBeCalled()
})

test('POST /scan/zero', async () => {
  importerMock.doZero.mockResolvedValue()

  await request(app)
    .post('/scan/zero')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
  expect(importer.doZero).toBeCalled()
})

test('GET /scan/hmpb/ballot/:ballotId', async () => {
  const contest = election.contests.find(
    ({ type }) => type === 'candidate'
  ) as CandidateContest
  const option = contest.candidates[0]
  const batchId = await store.addBatch()
  const ballotId = await store.addBallot(
    batchId,
    '/tmp/image.jpg',
    '/tmp/image-normalized.jpg',
    {
      type: 'InterpretedHmpbBallot',
      normalizedImage: EMPTY_IMAGE,
      cvr: {
        _ballotId: 'abc',
        _ballotStyleId: '12',
        _precinctId: '23',
        _scannerId: 'def',
        _testBallot: false,
        _pageNumber: 1,
        _locales: { primary: 'en-US' },
      },
      markInfo: {
        ballotSize: { width: 0, height: 0 },
        marks: [
          {
            type: 'candidate',
            contest,
            option,
            bounds: zeroRect,
            score: 1,
            target: { bounds: zeroRect, inner: zeroRect },
          },
        ],
      },
      metadata: {
        ballotStyleId: '12',
        precinctId: '23',
        isTestBallot: false,
        pageNumber: 1,
        pageCount: 1,
        locales: { primary: 'en-US' },
      },
    }
  )
  await store.finishBatch(batchId)

  await request(app)
    .get(`/scan/hmpb/ballot/${ballotId}`)
    .set('Accept', 'application/json')
    .expect(200, {
      type: 'ReviewMarginalMarksBallot',
      ballot: {
        url: '/scan/hmpb/ballot/1',
        image: { url: '/scan/hmpb/ballot/1/image', width: 0, height: 0 },
      },
      marks: { president: { 'barchi-hallaren': MarkStatus.Marked } },
      contests: [],
      layout: [],
      adjudicationInfo: {
        enabledReasons: [
          AdjudicationReason.UninterpretableBallot,
          AdjudicationReason.MarginalMark,
        ],
        allReasonInfos: [],
      },
    })
})

test('GET /scan/hmpb/ballot/:ballotId 404', async () => {
  await request(app)
    .get(`/scan/hmpb/ballot/111`)
    .set('Accept', 'application/json')
    .expect(404)
})

test('PATCH /scan/hmpb/ballot/:ballotId', async () => {
  const candidateContest = election.contests.find(
    ({ type }) => type === 'candidate'
  ) as CandidateContest
  const candidateOption = candidateContest.candidates[0]
  const yesnoContest = election.contests.find(
    ({ type }) => type === 'yesno'
  ) as YesNoContest
  const yesnoOption = 'no'
  const batchId = await store.addBatch()
  const ballotId = await store.addBallot(
    batchId,
    '/tmp/image.jpg',
    '/tmp/image-normalized.jpg',
    {
      type: 'InterpretedHmpbBallot',
      normalizedImage: EMPTY_IMAGE,
      cvr: {
        _ballotId: 'abc',
        _ballotStyleId: '12',
        _precinctId: '23',
        _scannerId: 'def',
        _testBallot: false,
        _pageNumber: 1,
        _locales: { primary: 'en-US' },
      },
      markInfo: {
        ballotSize: { width: 0, height: 0 },
        marks: [
          {
            type: 'candidate',
            contest: candidateContest,
            option: candidateOption,
            bounds: zeroRect,
            score: 1,
            target: { bounds: zeroRect, inner: zeroRect },
          },
          {
            type: 'yesno',
            contest: yesnoContest,
            option: yesnoOption,
            bounds: zeroRect,
            score: 0,
            target: { bounds: zeroRect, inner: zeroRect },
          },
        ],
      },
      metadata: {
        ballotStyleId: '12',
        precinctId: '23',
        isTestBallot: false,
        pageNumber: 1,
        pageCount: 1,
        locales: { primary: 'en-US' },
      },
    }
  )
  await store.finishBatch(batchId)
  await request(app)
    .patch(`/scan/hmpb/ballot/${ballotId}`)
    .send({
      [candidateContest.id]: { [candidateOption.id]: MarkStatus.Unmarked },
      [yesnoContest.id]: { [yesnoOption]: MarkStatus.Marked },
    })
    .expect(200, { status: 'ok' })

  expect(
    (await request(app).get(`/scan/hmpb/ballot/${ballotId}`).expect(200)).body
  ).toEqual({
    type: 'ReviewMarginalMarksBallot',
    ballot: {
      url: `/scan/hmpb/ballot/${ballotId}`,
      image: {
        url: `/scan/hmpb/ballot/${ballotId}/image`,
        width: 0,
        height: 0,
      },
    },
    marks: {
      [candidateContest.id]: { [candidateOption.id]: MarkStatus.Unmarked },
      [yesnoContest.id]: { [yesnoOption]: MarkStatus.Marked },
    },
    contests: [],
    layout: [],
    adjudicationInfo: {
      enabledReasons: [
        AdjudicationReason.UninterpretableBallot,
        AdjudicationReason.MarginalMark,
      ],
      allReasonInfos: [
        {
          type: AdjudicationReason.Undervote,
          contestId: yesnoContest.id,
          expected: 1,
          optionIds: [],
        },
      ],
    },
  })

  // patches accumulate
  await request(app)
    .patch(`/scan/hmpb/ballot/${ballotId}`)
    .send({
      [candidateContest.id]: { [candidateOption.id]: MarkStatus.Marked },
    })
    .expect(200, { status: 'ok' })
  expect(
    (await request(app).get(`/scan/hmpb/ballot/${ballotId}`).expect(200)).body
  ).toEqual({
    type: 'ReviewMarginalMarksBallot',
    ballot: {
      url: `/scan/hmpb/ballot/${ballotId}`,
      image: {
        url: `/scan/hmpb/ballot/${ballotId}/image`,
        width: 0,
        height: 0,
      },
    },
    marks: {
      [candidateContest.id]: { [candidateOption.id]: MarkStatus.Marked },
      [yesnoContest.id]: { [yesnoOption]: MarkStatus.Marked },
    },
    contests: [],
    layout: [],
    adjudicationInfo: {
      enabledReasons: [
        AdjudicationReason.UninterpretableBallot,
        AdjudicationReason.MarginalMark,
      ],
      allReasonInfos: [
        {
          type: AdjudicationReason.Undervote,
          contestId: yesnoContest.id,
          expected: 1,
          optionIds: [],
        },
      ],
    },
  })
})

test('GET /scan/hmpb/ballot/:ballotId/image', async () => {
  const original = join(
    __dirname,
    '../test/fixtures/state-of-hamilton/filled-in-dual-language-p1-flipped.jpg'
  )
  const normalized = join(
    __dirname,
    '../test/fixtures/state-of-hamilton/filled-in-dual-language-p1.jpg'
  )
  const batchId = await store.addBatch()
  const ballotId = await store.addBallot(batchId, original, normalized, {
    type: 'InterpretedHmpbBallot',
    normalizedImage: EMPTY_IMAGE,
    metadata: {
      ballotStyleId: '12',
      precinctId: '23',
      isTestBallot: false,
      pageNumber: 1,
      pageCount: 5,
    },
    cvr: {
      _ballotId: 'abc',
      _ballotStyleId: '12',
      _precinctId: '23',
      _scannerId: 'def',
      _testBallot: false,
    },
    markInfo: {
      ballotSize: { width: 0, height: 0 },
      marks: [],
    },
  })
  await store.finishBatch(batchId)

  await request(app)
    .get(`/scan/hmpb/ballot/${ballotId}/image`)
    .expect(301)
    .expect('Location', `/scan/hmpb/ballot/${ballotId}/image/normalized`)

  await request(app)
    .get(`/scan/hmpb/ballot/${ballotId}/image/normalized`)
    .expect(200, await fs.readFile(normalized))

  await request(app)
    .get(`/scan/hmpb/ballot/${ballotId}/image/original`)
    .expect(200, await fs.readFile(original))
})

test('GET /scan/hmpb/ballot/:ballotId/image 404', async () => {
  await request(app).get(`/scan/hmpb/ballot/111/image/normalized`).expect(404)
})

test('GET /', async () => {
  const response = await request(app).get('/').expect(200)
  expect(response.text).toContain('Test Page for Scan')
})

test('POST /scan/hmpb/addTemplates bad template', async () => {
  const response = await request(app)
    .post('/scan/hmpb/addTemplates')
    .attach('ballots', Buffer.of(), {
      filename: 'README.txt',
      contentType: 'text/plain',
    })
    .expect(400)
  expect(JSON.parse(response.text)).toEqual({
    errors: [
      {
        type: 'invalid-ballot-type',
        message:
          'expected ballot files to be application/pdf, but got text/plain',
      },
    ],
  })
})

test('POST /scan/hmpb/addTemplates bad metadata', async () => {
  const response = await request(app)
    .post('/scan/hmpb/addTemplates')
    .attach('ballots', Buffer.of(), {
      filename: 'ballot.pdf',
      contentType: 'application/pdf',
    })
    .expect(400)
  expect(JSON.parse(response.text)).toEqual({
    errors: [
      {
        type: 'invalid-metadata-type',
        message:
          'expected ballot metadata to be application/json, but got undefined',
      },
    ],
  })
})

test('POST /scan/hmpb/addTemplates', async () => {
  importerMock.addHmpbTemplates.mockResolvedValueOnce([
    {
      ballotImage: {
        imageData: createImageData(Uint8ClampedArray.of(0, 0, 0, 0), 1, 1),
        metadata: {
          ballotStyleId: '77',
          precinctId: '42',
          isTestBallot: false,
          pageNumber: 1,
          pageCount: 2,
        },
      },
      contests: [],
    },
  ])

  const response = await request(app)
    .post('/scan/hmpb/addTemplates')
    .attach('ballots', Buffer.of(4, 5, 6), {
      filename: 'ballot.pdf',
      contentType: 'application/pdf',
    })
    .attach(
      'metadatas',
      Buffer.from(
        new TextEncoder().encode(
          JSON.stringify({
            ballotStyleId: '77',
            precinctId: '42',
            isTestBallot: false,
          })
        )
      ),
      { filename: 'metadata.json', contentType: 'application/json' }
    )
    .expect(200)

  expect(JSON.parse(response.text)).toEqual({ status: 'ok' })
})

test('start reloads configuration from the store', async () => {
  // don't actually listen
  jest.spyOn(app, 'listen').mockImplementationOnce((_port, onListening) => {
    onListening?.()
    return (undefined as unknown) as Server
  })

  // start up the server
  await start({ store, importer, app, log: jest.fn() })

  // did we load everything from the store?
  expect(importer.restoreConfig).toHaveBeenCalled()
})
