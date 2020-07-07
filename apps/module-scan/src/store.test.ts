import { CandidateContest, YesNoContest } from '@votingworks/ballot-encoder'
import { promises as fs } from 'fs'
import * as tmp from 'tmp'
import election from '../test/fixtures/state-of-hamilton/election'
import zeroRect from '../test/fixtures/zeroRect'
import Store from './store'

test('get/set election', async () => {
  const store = await Store.memoryStore()

  expect(await store.getElection()).toBeUndefined()

  await store.setElection(election)
  expect(await store.getElection()).toEqual(election)

  await store.setElection(undefined)
  expect(await store.getElection()).toBeUndefined()
})

test('get/set test mode', async () => {
  const store = await Store.memoryStore()

  expect(await store.getTestMode()).toBe(false)

  await store.setTestMode(true)
  expect(await store.getTestMode()).toBe(true)

  await store.setTestMode(false)
  expect(await store.getTestMode()).toBe(false)
})

test('HMPB template handling', async () => {
  const store = await Store.memoryStore()

  expect(await store.getHmpbTemplates()).toEqual([])

  await store.addHmpbTemplate(Buffer.of(1, 2, 3), [
    {
      ballotImage: {
        metadata: {
          ballotStyleId: '12',
          precinctId: '23',
          isTestBallot: false,
          pageNumber: 1,
          pageCount: 2,
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
        },
      },
      contests: [],
    },
  ])

  expect(await store.getHmpbTemplates()).toEqual([
    [
      Buffer.of(1, 2, 3),
      [
        {
          ballotImage: {
            metadata: {
              ballotStyleId: '12',
              precinctId: '23',
              isTestBallot: false,
              pageNumber: 1,
              pageCount: 2,
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
            },
          },
          contests: [],
        },
      ],
    ],
  ])
})

test('destroy database', async () => {
  const dbFile = tmp.fileSync()
  const store = new Store(dbFile.name)

  await store.init()
  await fs.access(dbFile.name)

  await store.dbDestroy()
  await expect(fs.access(dbFile.name)).rejects.toThrowError('ENOENT')
})

test('adjudication', async () => {
  const candidateContest = election.contests.find(
    (contest) => contest.type === 'candidate'
  ) as CandidateContest
  const candidateOption = candidateContest.candidates[0]
  const yesnoContest = election.contests.find(
    (contest) => contest.type === 'yesno'
  ) as YesNoContest
  const yesnoOption = 'yes'

  const store = await Store.memoryStore()
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
      contests: [
        {
          bounds: zeroRect,
          corners: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
          options: [
            {
              bounds: zeroRect,
              target: {
                bounds: zeroRect,
                inner: zeroRect,
              },
            },
          ],
        },
        {
          bounds: zeroRect,
          corners: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
          options: [
            {
              bounds: zeroRect,
              target: {
                bounds: zeroRect,
                inner: zeroRect,
              },
            },
          ],
        },
      ],
    },
  ])
  const batchId = await store.addBatch()
  const ballotId = await store.addCVR(
    batchId,
    '/a/ballot.jpg',
    {
      _ballotId: 'abcde',
      _ballotStyleId: '12',
      _precinctId: '23',
      _scannerId: '123',
      _testBallot: false,
      _pageNumber: 1,
      _locales: { primary: 'en-US' },
    },
    {
      ballotSize: { width: 800, height: 1000 },
      marks: [
        {
          type: 'candidate',
          contest: candidateContest,
          option: candidateOption,
          score: 0,
          bounds: zeroRect,
          target: {
            bounds: zeroRect,
            inner: zeroRect,
          },
        },
        {
          type: 'yesno',
          contest: yesnoContest,
          option: yesnoOption,
          score: 1,
          bounds: zeroRect,
          target: {
            bounds: zeroRect,
            inner: zeroRect,
          },
        },
      ],
    },
    {
      ballotStyleId: '12',
      precinctId: '23',
      isTestBallot: false,
      pageNumber: 1,
      pageCount: 2,
      locales: { primary: 'en-US' },
    }
  )
  await store.finishBatch(batchId)

  expect(await store.getBallot(ballotId)).toEqual(
    expect.objectContaining({
      marks: {
        [candidateContest.id]: { [candidateOption.id]: false },
        [yesnoContest.id]: { [yesnoOption]: true },
      },
    })
  )

  await store.saveBallotAdjudication(ballotId, {
    [candidateContest.id]: { [candidateOption.id]: true },
    [yesnoContest.id]: { [yesnoOption]: false },
  })

  expect(await store.getBallot(ballotId)).toEqual(
    expect.objectContaining({
      marks: {
        [candidateContest.id]: { [candidateOption.id]: true },
        [yesnoContest.id]: { [yesnoOption]: false },
      },
    })
  )
})

test('getBatch with a batch that does not exist', async () => {
  const store = await Store.memoryStore()

  expect(await store.getBatch(999)).toEqual([])
})

test('getBatch with a batch that does exist', async () => {
  const store = await Store.memoryStore()
  await store.setElection(election)
  const batchId = await store.addBatch()
  await store.addCVR(
    batchId,
    '/a/ballot.jpg',
    {
      _ballotId: 'abcde',
      _ballotStyleId: '12',
      _precinctId: '23',
      _scannerId: '123',
      _testBallot: false,
    },
    {
      ballotSize: { width: 800, height: 1000 },
      marks: [],
    }
  )
  await store.finishBatch(batchId)

  expect(await store.getBatch(batchId)).toMatchInlineSnapshot(`
    Array [
      Object {
        "cvr": Object {
          "_ballotId": "abcde",
          "_ballotStyleId": "12",
          "_precinctId": "23",
          "_scannerId": "123",
          "_testBallot": false,
        },
        "filename": "/a/ballot.jpg",
        "id": 1,
        "marks": Object {
          "ballotSize": Object {
            "height": 1000,
            "width": 800,
          },
          "marks": Array [],
        },
      },
    ]
  `)
})
