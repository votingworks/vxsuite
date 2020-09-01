import {
  AdjudicationReason,
  CandidateContest,
  YesNoContest,
} from '@votingworks/ballot-encoder'
import { promises as fs } from 'fs'
import * as tmp from 'tmp'
import { v4 as uuid } from 'uuid'
import election from '../test/fixtures/state-of-hamilton/election'
import zeroRect from '../test/fixtures/zeroRect'
import Store from './store'
import { MarkStatus } from './types/ballot-review'
import { SheetOf, PageInterpretationWithFiles, Side } from './types'

test('get/set election', async () => {
  const store = await Store.memoryStore()

  expect(await store.getElection()).toBeUndefined()

  await store.setElection(election)
  expect(await store.getElection()).toEqual(expect.objectContaining(election))

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
  const store = await Store.fileStore(dbFile.name)

  await store.reset()
  await fs.access(dbFile.name)

  await store.dbDestroy()
  await expect(fs.access(dbFile.name)).rejects.toThrowError('ENOENT')
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
  await store.setElection(election)
  await store.addHmpbTemplate(
    Buffer.of(),
    [1, 2].map((pageNumber) => ({
      ballotImage: {
        metadata: {
          ballotStyleId: '12',
          precinctId: '23',
          isTestBallot: false,
          pageNumber,
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
              score: 0.2, // marginal
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
              bounds: zeroRect,
              target: {
                bounds: zeroRect,
                inner: zeroRect,
              },
            },
          ],
        },
        metadata: {
          ballotStyleId: '12',
          precinctId: '23',
          isTestBallot: false,
          pageNumber: 1,
          pageCount: 2,
          locales: { primary: 'en-US' },
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
  await store.finishBatch({ batchId })

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
