/* eslint-disable jest/expect-expect */

import {
  AdjudicationReason,
  CandidateContest,
  YesNoContest,
  BallotType,
} from '@votingworks/ballot-encoder'
import { Application } from 'express'
import { promises as fs } from 'fs'
import { Server } from 'http'
import { join } from 'path'
import request from 'supertest'
import { v4 as uuid } from 'uuid'
import election from '../test/fixtures/state-of-hamilton/election'
import zeroRect from '../test/fixtures/zeroRect'
import { makeMockImporter } from '../test/util/mocks'
import { Importer } from './importer'
import { buildApp, start } from './server'
import Store from './store'
import { ScanStatus } from './types'
import { MarkStatus } from './types/ballot-review'
import { fromElection } from './util/electionDefinition'

jest.mock('./importer')

let app: Application
let importer: Importer
let store: Store
let importerMock: jest.Mocked<Importer>

beforeEach(async () => {
  importer = makeMockImporter()
  importerMock = importer as jest.Mocked<Importer>
  store = await Store.memoryStore()
  await store.setElection({
    election,
    electionData: JSON.stringify(election),
    electionHash: '',
  })
  await store.addHmpbTemplate(
    Buffer.of(),
    {
      locales: { primary: 'en-US' },
      electionHash: '',
      ballotType: BallotType.Standard,
      ballotStyleId: '12',
      precinctId: '23',
      isTestMode: false,
    },
    [
      {
        ballotImage: {
          metadata: {
            locales: { primary: 'en-US' },
            electionHash: '',
            ballotType: BallotType.Standard,
            ballotStyleId: '12',
            precinctId: '23',
            isTestMode: false,
            pageNumber: 1,
          },
        },
        contests: [],
      },
      {
        ballotImage: {
          metadata: {
            locales: { primary: 'en-US' },
            electionHash: '',
            ballotType: BallotType.Standard,
            ballotStyleId: '12',
            precinctId: '23',
            isTestMode: false,
            pageNumber: 2,
          },
        },
        contests: [],
      },
    ]
  )
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
  await store.setElection(fromElection(election))
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
      election: expect.objectContaining({
        title: 'General Election',
      }),
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
  importerMock.startImport.mockResolvedValue('mock-batch-id')
  await request(app)
    .post('/scan/scanBatch')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok', batchId: 'mock-batch-id' })
  expect(importer.startImport).toBeCalled()
})

test('POST /scan/scanContinue', async () => {
  importerMock.continueImport.mockResolvedValue(undefined)
  await request(app)
    .post('/scan/scanContinue')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
  expect(importer.continueImport).toBeCalled()
})

test('POST /scan/scanBatch errors', async () => {
  importerMock.startImport.mockRejectedValue(new Error('scanner is a teapot'))
  await request(app)
    .post('/scan/scanBatch')
    .set('Accept', 'application/json')
    .expect(200, { status: 'could not scan: scanner is a teapot' })
  expect(importer.startImport).toBeCalled()
})

test('POST /scan/scanFiles', async () => {
  importerMock.importFile.mockResolvedValueOnce(uuid())
  await request(app)
    .post('/scan/scanFiles')
    .attach('files', Buffer.of(), {
      filename: 'p1.jpg',
      contentType: 'image/jpeg',
    })
    .attach('files', Buffer.of(), {
      filename: 'p2.jpg',
      contentType: 'image/jpeg',
    })
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

test('GET /scan/hmpb/ballot/:sheetId/:side', async () => {
  const president = election.contests.find(
    ({ id }) => id === 'president'
  ) as CandidateContest
  const questionA = election.contests.find(
    ({ id }) => id === 'question-a'
  ) as YesNoContest
  const batchId = await store.addBatch()
  const sheetId = await store.addSheet(uuid(), batchId, [
    {
      originalFilename: '/front.png',
      normalizedFilename: '/front-normalized.png',
      interpretation: {
        type: 'InterpretedHmpbPage',
        votes: {},
        markInfo: {
          ballotSize: { width: 0, height: 0 },
          marks: [
            {
              type: 'candidate',
              contest: president,
              option: president.candidates[0],
              bounds: zeroRect,
              score: 1,
              scoredOffset: { x: 0, y: 0 },
              target: { bounds: zeroRect, inner: zeroRect },
            },
          ],
        },
        metadata: {
          locales: { primary: 'en-US' },
          electionHash: '',
          ballotType: BallotType.Standard,
          ballotStyleId: '12',
          precinctId: '23',
          isTestMode: false,
          pageNumber: 1,
        },
        adjudicationInfo: {
          requiresAdjudication: false,
          enabledReasons: [
            AdjudicationReason.UninterpretableBallot,
            AdjudicationReason.MarginalMark,
          ],
          allReasonInfos: [],
        },
      },
    },
    {
      originalFilename: '/back.png',
      normalizedFilename: '/back-normalized.png',
      interpretation: {
        type: 'InterpretedHmpbPage',
        votes: {},
        markInfo: {
          ballotSize: { width: 0, height: 0 },
          marks: [
            {
              type: 'yesno',
              contest: questionA,
              option: 'yes',
              bounds: zeroRect,
              score: 1,
              scoredOffset: { x: 0, y: 0 },
              target: { bounds: zeroRect, inner: zeroRect },
            },
          ],
        },
        metadata: {
          locales: { primary: 'en-US' },
          electionHash: '',
          ballotType: BallotType.Standard,
          ballotStyleId: '12',
          precinctId: '23',
          isTestMode: false,
          pageNumber: 2,
        },
        adjudicationInfo: {
          requiresAdjudication: false,
          enabledReasons: [
            AdjudicationReason.UninterpretableBallot,
            AdjudicationReason.MarginalMark,
          ],
          allReasonInfos: [],
        },
      },
    },
  ])
  await store.finishBatch({ batchId })

  await request(app)
    .get(`/scan/hmpb/ballot/${sheetId}/front`)
    .set('Accept', 'application/json')
    .expect(200, {
      type: 'ReviewMarginalMarksBallot',
      ballot: {
        id: sheetId,
        url: `/scan/hmpb/ballot/${sheetId}/front`,
        image: {
          url: `/scan/hmpb/ballot/${sheetId}/front/image`,
          width: 0,
          height: 0,
        },
      },
      marks: { president: { 'barchi-hallaren': MarkStatus.Marked } },
      contests: [],
      layout: [],
      adjudicationInfo: {
        requiresAdjudication: false,
        enabledReasons: [
          AdjudicationReason.UninterpretableBallot,
          AdjudicationReason.MarginalMark,
        ],
        allReasonInfos: [],
      },
    })
})

test('GET /scan/hmpb/ballot/:sheetId/:side 404', async () => {
  await request(app)
    .get(`/scan/hmpb/ballot/111/front`)
    .set('Accept', 'application/json')
    .expect(404)
  await request(app)
    .get(`/scan/hmpb/ballot/111/back`)
    .set('Accept', 'application/json')
    .expect(404)
})

test('PATCH /scan/hmpb/ballot/:sheetId/:side', async () => {
  const president = election.contests.find(
    ({ id }) => id === 'president'
  ) as CandidateContest
  const questionA = election.contests.find(
    ({ id }) => id === 'question-a'
  ) as YesNoContest
  const batchId = await store.addBatch()
  const sheetId = await store.addSheet(uuid(), batchId, [
    {
      originalFilename: '/front.png',
      normalizedFilename: '/front-normalized.png',
      interpretation: {
        type: 'InterpretedHmpbPage',
        votes: {},
        markInfo: {
          ballotSize: { width: 0, height: 0 },
          marks: [
            {
              type: 'candidate',
              contest: president,
              option: president.candidates[0],
              bounds: zeroRect,
              score: 1,
              scoredOffset: { x: 0, y: 0 },
              target: { bounds: zeroRect, inner: zeroRect },
            },
          ],
        },
        metadata: {
          locales: { primary: 'en-US' },
          electionHash: '',
          ballotType: BallotType.Standard,
          ballotStyleId: '12',
          precinctId: '23',
          isTestMode: false,
          pageNumber: 1,
        },
        adjudicationInfo: {
          requiresAdjudication: true,
          enabledReasons: [
            AdjudicationReason.UninterpretableBallot,
            AdjudicationReason.MarginalMark,
            AdjudicationReason.Undervote,
          ],
          allReasonInfos: [
            {
              type: AdjudicationReason.MarginalMark,
              contestId: president.id,
              optionId: president.candidates[0].id,
            },
          ],
        },
      },
    },
    {
      originalFilename: '/back.png',
      normalizedFilename: '/back-normalized.png',
      interpretation: {
        type: 'InterpretedHmpbPage',
        votes: {},
        markInfo: {
          ballotSize: { width: 0, height: 0 },
          marks: [
            {
              type: 'yesno',
              contest: questionA,
              option: 'yes',
              bounds: zeroRect,
              score: 1,
              scoredOffset: { x: 0, y: 0 },
              target: { bounds: zeroRect, inner: zeroRect },
            },
          ],
        },
        metadata: {
          locales: { primary: 'en-US' },
          electionHash: '',
          ballotType: BallotType.Standard,
          ballotStyleId: '12',
          precinctId: '23',
          isTestMode: false,
          pageNumber: 2,
        },
        adjudicationInfo: {
          requiresAdjudication: true,
          enabledReasons: [
            AdjudicationReason.UninterpretableBallot,
            AdjudicationReason.MarginalMark,
            AdjudicationReason.Undervote,
          ],
          allReasonInfos: [
            {
              type: AdjudicationReason.Undervote,
              contestId: questionA.id,
              expected: 1,
              optionIds: [],
            },
          ],
        },
      },
    },
  ])
  await store.finishBatch({ batchId })

  await request(app)
    .patch(`/scan/hmpb/ballot/${sheetId}/front`)
    .send({
      [president.id]: { [president.id]: MarkStatus.Unmarked },
    })
    .expect(200, { status: 'ok' })

  expect(
    (await request(app).get(`/scan/hmpb/ballot/${sheetId}/front`).expect(200))
      .body
  ).toEqual(
    expect.objectContaining({
      marks: {
        [president.id]: { [president.candidates[0].id]: MarkStatus.Marked },
      },
    })
  )

  await request(app)
    .patch(`/scan/hmpb/ballot/${sheetId}/back`)
    .send({
      [questionA.id]: { yes: MarkStatus.Marked },
    })
    .expect(200, { status: 'ok' })
  expect(
    (await request(app).get(`/scan/hmpb/ballot/${sheetId}/back`).expect(200))
      .body
  ).toEqual(
    expect.objectContaining({
      marks: {
        [questionA.id]: { yes: MarkStatus.Marked },
      },
    })
  )
})

test('GET /scan/hmpb/ballot/:ballotId/:side/image', async () => {
  const frontOriginal = join(
    __dirname,
    '../test/fixtures/state-of-hamilton/filled-in-dual-language-p1-flipped.jpg'
  )
  const frontNormalized = join(
    __dirname,
    '../test/fixtures/state-of-hamilton/filled-in-dual-language-p1.jpg'
  )
  const backOriginal = join(
    __dirname,
    '../test/fixtures/state-of-hamilton/filled-in-dual-language-p2.jpg'
  )
  const backNormalized = join(
    __dirname,
    '../test/fixtures/state-of-hamilton/filled-in-dual-language-p2.jpg'
  )
  const batchId = await store.addBatch()
  const sheetId = await store.addSheet(uuid(), batchId, [
    {
      originalFilename: frontOriginal,
      normalizedFilename: frontNormalized,
      interpretation: {
        type: 'InterpretedHmpbPage',
        metadata: {
          locales: { primary: 'en-US' },
          electionHash: '',
          ballotType: BallotType.Standard,
          ballotStyleId: '12',
          precinctId: '23',
          isTestMode: false,
          pageNumber: 1,
        },
        votes: {},
        markInfo: {
          ballotSize: { width: 0, height: 0 },
          marks: [],
        },
        adjudicationInfo: {
          requiresAdjudication: false,
          enabledReasons: [],
          allReasonInfos: [],
        },
      },
    },
    {
      originalFilename: backOriginal,
      normalizedFilename: backNormalized,
      interpretation: {
        type: 'InterpretedHmpbPage',
        metadata: {
          locales: { primary: 'en-US' },
          electionHash: '',
          ballotType: BallotType.Standard,
          ballotStyleId: '12',
          precinctId: '23',
          isTestMode: false,
          pageNumber: 2,
        },
        votes: {},
        markInfo: {
          ballotSize: { width: 0, height: 0 },
          marks: [],
        },
        adjudicationInfo: {
          requiresAdjudication: false,
          enabledReasons: [],
          allReasonInfos: [],
        },
      },
    },
  ])
  await store.finishBatch({ batchId })

  await request(app)
    .get(`/scan/hmpb/ballot/${sheetId}/front/image`)
    .expect(301)
    .expect('Location', `/scan/hmpb/ballot/${sheetId}/front/image/normalized`)

  await request(app)
    .get(`/scan/hmpb/ballot/${sheetId}/front/image/normalized`)
    .expect(200, await fs.readFile(frontNormalized))

  await request(app)
    .get(`/scan/hmpb/ballot/${sheetId}/front/image/original`)
    .expect(200, await fs.readFile(frontOriginal))

  await request(app)
    .get(`/scan/hmpb/ballot/${sheetId}/back/image`)
    .expect(301)
    .expect('Location', `/scan/hmpb/ballot/${sheetId}/back/image/normalized`)

  await request(app)
    .get(`/scan/hmpb/ballot/${sheetId}/back/image/normalized`)
    .expect(200, await fs.readFile(backNormalized))

  await request(app)
    .get(`/scan/hmpb/ballot/${sheetId}/back/image/original`)
    .expect(200, await fs.readFile(backOriginal))
})

test('GET /scan/hmpb/ballot/:sheetId/image 404', async () => {
  await request(app)
    .get(`/scan/hmpb/ballot/111/front/image/normalized`)
    .expect(404)
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
        imageData: {
          data: Uint8ClampedArray.of(0, 0, 0, 0),
          width: 1,
          height: 1,
        },
        metadata: {
          locales: { primary: 'en-US' },
          electionHash: '',
          ballotType: BallotType.Standard,
          ballotStyleId: '77',
          precinctId: '42',
          isTestMode: false,
          pageNumber: 1,
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
            isTestMode: false,
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

test('get next sheet', async () => {
  jest
    .spyOn(store, 'getNextAdjudicationSheet')
    .mockImplementationOnce(async () => {
      return {
        id: 'mock-review-sheet',
        front: {
          image: { url: '/url/front' },
          interpretation: { type: 'BlankPage' },
        },
        back: {
          image: { url: '/url/back' },
          interpretation: { type: 'BlankPage' },
        },
      }
    })

  await request(app)
    .get(`/scan/hmpb/review/next-sheet`)
    .expect(200, {
      id: 'mock-review-sheet',
      front: {
        image: { url: '/url/front' },
        interpretation: { type: 'BlankPage' },
      },
      back: {
        image: { url: '/url/back' },
        interpretation: { type: 'BlankPage' },
      },
    })
})
