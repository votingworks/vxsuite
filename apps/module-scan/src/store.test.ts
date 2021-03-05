import {
  AdjudicationReason,
  BallotType,
  CandidateContest,
  YesNoContest,
} from '@votingworks/types'
import { promises as fs } from 'fs'
import * as tmp from 'tmp'
import { v4 as uuid } from 'uuid'
import election from '../test/fixtures/state-of-hamilton/election'
import zeroRect from '../test/fixtures/zeroRect'
import Store from './store'
import {
  BallotMetadata,
  PageInterpretationWithFiles,
  SheetOf,
  Side,
} from './types'
import { MarkStatus } from './types/ballot-review'
import { fromElection } from './util/electionDefinition'

test('get/set election', async () => {
  const store = await Store.memoryStore()

  expect(await store.getElectionDefinition()).toBeUndefined()

  await store.setElection(fromElection(election))
  expect((await store.getElectionDefinition())?.election).toEqual(election)

  await store.setElection(undefined)
  expect(await store.getElectionDefinition()).toBeUndefined()
})

test('get/set test mode', async () => {
  const store = await Store.memoryStore()

  expect(await store.getTestMode()).toBe(false)

  await store.setTestMode(true)
  expect(await store.getTestMode()).toBe(true)

  await store.setTestMode(false)
  expect(await store.getTestMode()).toBe(false)
})

test('get/set mark threshold overrides', async () => {
  const store = await Store.memoryStore()

  expect(await store.getMarkThresholdOverrides()).toBe(undefined)

  await store.setMarkThresholdOverrides({ definite: 0.4, marginal: 0.5 })
  expect(await store.getMarkThresholdOverrides()).toStrictEqual({
    definite: 0.4,
    marginal: 0.5,
  })

  await store.setMarkThresholdOverrides(undefined)
  expect(await store.getMarkThresholdOverrides()).toBe(undefined)
})

test('get current mark thresholds falls back to election definition defaults', async () => {
  const store = await Store.memoryStore()
  await store.setElection(fromElection(election))
  expect(await store.getCurrentMarkThresholds()).toStrictEqual({
    definite: 0.17,
    marginal: 0.12,
  })

  await store.setMarkThresholdOverrides({ definite: 0.4, marginal: 0.5 })
  expect(await store.getCurrentMarkThresholds()).toStrictEqual({
    definite: 0.4,
    marginal: 0.5,
  })

  await store.setMarkThresholdOverrides(undefined)
  expect(await store.getCurrentMarkThresholds()).toStrictEqual({
    definite: 0.17,
    marginal: 0.12,
  })
})

test('HMPB template handling', async () => {
  const store = await Store.memoryStore()
  const metadata: BallotMetadata = {
    electionHash: '',
    locales: { primary: 'en-US' },
    ballotStyleId: '12',
    precinctId: '23',
    isTestMode: false,
    ballotType: BallotType.Standard,
  }

  expect(await store.getHmpbTemplates()).toEqual([])

  await store.addHmpbTemplate(Buffer.of(1, 2, 3), metadata, [
    {
      ballotImage: {
        metadata: {
          ...metadata,
          pageNumber: 1,
        },
      },
      contests: [],
    },
    {
      ballotImage: {
        metadata: {
          ...metadata,
          pageNumber: 2,
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
              electionHash: '',
              ballotType: BallotType.Standard,
              locales: { primary: 'en-US' },
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
              electionHash: '',
              ballotType: BallotType.Standard,
              locales: { primary: 'en-US' },
              ballotStyleId: '12',
              precinctId: '23',
              isTestMode: false,
              pageNumber: 2,
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
  const store = await Store.fileStore(dbFile.name)

  await store.reset()
  await fs.access(dbFile.name)

  await store.dbDestroy()
  await expect(fs.access(dbFile.name)).rejects.toThrowError('ENOENT')
})

test('batch cleanup works correctly', async () => {
  const dbFile = tmp.fileSync()
  const store = await Store.fileStore(dbFile.name)

  await store.reset()

  const firstBatchId = await store.addBatch()
  await store.addBatch()
  await store.finishBatch({ batchId: firstBatchId })
  await store.cleanupIncompleteBatches()

  const batches = await store.batchStatus()
  expect(batches).toHaveLength(1)
  expect(batches[0].id).toEqual(firstBatchId)
})

test('adjudication', async () => {
  const candidateContests = election.contests.filter(
    (contest): contest is CandidateContest => contest.type === 'candidate'
  )
  const yesnoContests = election.contests.filter(
    (contest): contest is YesNoContest => contest.type === 'yesno'
  )
  const yesnoOption = 'yes'

  const store = await Store.memoryStore()
  const metadata: BallotMetadata = {
    electionHash: '',
    ballotStyleId: '12',
    precinctId: '23',
    isTestMode: false,
    locales: { primary: 'en-US' },
    ballotType: BallotType.Standard,
  }
  await store.setElection(fromElection(election))
  await store.addHmpbTemplate(
    Buffer.of(),
    metadata,
    [1, 2].map((pageNumber) => ({
      ballotImage: {
        metadata: {
          ...metadata,
          pageNumber,
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
    }))
  )
  const batchId = await store.addBatch()
  const ballotId = await store.addSheet(
    uuid(),
    batchId,
    [0, 1].map<PageInterpretationWithFiles>((i) => ({
      originalFilename: i === 0 ? '/front-original.png' : '/back-original.png',
      normalizedFilename:
        i === 0 ? '/front-normalized.png' : '/back-normalized.png',
      interpretation: {
        type: 'InterpretedHmpbPage',
        votes: {},
        markInfo: {
          ballotSize: { width: 800, height: 1000 },
          marks: [
            {
              type: 'candidate',
              contest: candidateContests[i],
              option: candidateContests[i].candidates[0],
              score: 0.12, // marginal
              scoredOffset: { x: 0, y: 0 },
              bounds: zeroRect,
              target: {
                bounds: zeroRect,
                inner: zeroRect,
              },
            },
            {
              type: 'yesno',
              contest: yesnoContests[i],
              option: yesnoOption,
              score: 1, // definite
              scoredOffset: { x: 0, y: 0 },
              bounds: zeroRect,
              target: {
                bounds: zeroRect,
                inner: zeroRect,
              },
            },
          ],
        },
        metadata: {
          electionHash: '',
          ballotStyleId: '12',
          precinctId: '23',
          isTestMode: false,
          pageNumber: 1,
          locales: { primary: 'en-US' },
          ballotType: BallotType.Standard,
        },
        adjudicationInfo: {
          requiresAdjudication: true,
          enabledReasons: [
            AdjudicationReason.UninterpretableBallot,
            AdjudicationReason.MarginalMark,
          ],
          allReasonInfos: [
            {
              type: AdjudicationReason.MarginalMark,
              contestId: candidateContests[i].id,
              optionId: candidateContests[i].candidates[0].id,
            },
            {
              type: AdjudicationReason.Undervote,
              contestId: candidateContests[i].id,
              expected: 1,
              optionIds: [],
            },
          ],
        },
      },
    })) as SheetOf<PageInterpretationWithFiles>
  )

  // check the review paths
  const reviewBallot = await store.getNextReviewBallot()
  expect(reviewBallot?.ballot?.id).toEqual(ballotId)

  const reviewSheet = await store.getNextAdjudicationSheet()
  expect(reviewSheet?.id).toEqual(ballotId)

  await store.finishBatch({ batchId })

  // cleaning up batches now should have no impact
  await store.cleanupIncompleteBatches()

  await Promise.all(
    (['front', 'back'] as Side[]).map(async (side, i) => {
      expect(await store.getPage(ballotId, side)).toEqual(
        expect.objectContaining({
          marks: {
            [candidateContests[i].id]: {
              [candidateContests[i].candidates[0].id]: MarkStatus.Marginal,
            },
            [yesnoContests[i].id]: { [yesnoOption]: MarkStatus.Marked },
          },
          adjudicationInfo: {
            requiresAdjudication: true,
            enabledReasons: [
              AdjudicationReason.UninterpretableBallot,
              AdjudicationReason.MarginalMark,
            ],
            allReasonInfos: [
              {
                type: AdjudicationReason.MarginalMark,
                contestId: candidateContests[i].id,
                optionId: candidateContests[i].candidates[0].id,
              },
              {
                type: AdjudicationReason.Undervote,
                contestId: candidateContests[i].id,
                expected: 1,
                optionIds: [],
              },
            ],
          },
        })
      )

      await store.saveBallotAdjudication(ballotId, side, {
        [candidateContests[i].id]: {
          [candidateContests[i].candidates[0].id]: MarkStatus.Marked,
        },
        [yesnoContests[i].id]: { [yesnoOption]: MarkStatus.Unmarked },
      })

      expect(await store.getPage(ballotId, side)).toEqual(
        expect.objectContaining({
          marks: {
            [candidateContests[i].id]: {
              [candidateContests[i].candidates[0].id]: MarkStatus.Marked,
            },
            [yesnoContests[i].id]: { [yesnoOption]: MarkStatus.Unmarked },
          },
          adjudicationInfo: {
            requiresAdjudication: true,
            enabledReasons: [
              AdjudicationReason.UninterpretableBallot,
              AdjudicationReason.MarginalMark,
            ],
            allReasonInfos: [
              {
                type: AdjudicationReason.MarginalMark,
                contestId: candidateContests[i].id,
                optionId: candidateContests[i].candidates[0].id,
              },
              {
                type: AdjudicationReason.Undervote,
                contestId: candidateContests[i].id,
                expected: 1,
                optionIds: [],
              },
            ],
          },
        })
      )
    })
  )
})
