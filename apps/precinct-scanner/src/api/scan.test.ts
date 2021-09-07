import {
  electionSampleDefinition,
  electionWithMsEitherNeitherWithDataFiles,
} from '@votingworks/fixtures'
import { AdjudicationReason, BallotType } from '@votingworks/types'
import {
  GetNextReviewSheetResponse,
  GetScanStatusResponse,
  ScannerStatus,
} from '@votingworks/types/src/api/module-scan'
import { typedAs } from '@votingworks/utils'
import fetchMock from 'fetch-mock'
import { DateTime } from 'luxon'
import { interpretedHmpb } from '../../test/fixtures'
import {
  RejectedScanningReason,
  RejectedScanningResult,
  ScanningResultNeedsReview,
  ScanningResultType,
} from '../config/types'
import * as scan from './scan'

const scanStatusReadyToScanResponseBody: GetScanStatusResponse = {
  scanner: ScannerStatus.ReadyToScan,
  batches: [],
  adjudication: { adjudicated: 0, remaining: 0 },
}
test('scanDetectedSheet throws on bad status', async () => {
  fetchMock.postOnce('scan/scanBatch', {
    body: { status: 'error', error: 'hello' },
  })
  await expect(
    scan.scanDetectedSheet()
  ).rejects.toThrowErrorMatchingInlineSnapshot('"hello"')
})

test('scanDetectedSheet throws on invalid batch', async () => {
  fetchMock.postOnce('scan/scanBatch', {
    body: { status: 'ok', batchId: 'test-batch' },
  })
  fetchMock.get('/scan/status', scanStatusReadyToScanResponseBody)
  await expect(
    scan.scanDetectedSheet()
  ).rejects.toThrowErrorMatchingInlineSnapshot('"batch not found: test-batch"')
})

test('scanDetectedSheet returns rejected ballot if batch has a 0 count', async () => {
  fetchMock.postOnce('scan/scanBatch', {
    body: { status: 'ok', batchId: 'test-batch' },
  })
  fetchMock.get(
    '/scan/status',
    typedAs<GetScanStatusResponse>({
      scanner: ScannerStatus.ReadyToScan,
      batches: [
        {
          id: 'test-batch',
          label: 'Batch 1',
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
          count: 0,
        },
      ],
      adjudication: { adjudicated: 0, remaining: 0 },
    })
  )
  const result = await scan.scanDetectedSheet()
  expect(result.resultType).toEqual(ScanningResultType.Rejected)
  expect((result as RejectedScanningResult).rejectionReason).toEqual(
    RejectedScanningReason.Unknown
  )
})

test('scanDetectedSheet returns accepted ballot when successful', async () => {
  fetchMock.postOnce('scan/scanBatch', {
    body: { status: 'ok', batchId: 'test-batch' },
  })
  fetchMock.get(
    '/scan/status',
    typedAs<GetScanStatusResponse>({
      scanner: ScannerStatus.ReadyToScan,
      batches: [
        {
          id: 'test-batch',
          label: 'Batch 1',
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
          count: 1,
        },
      ],
      adjudication: { adjudicated: 0, remaining: 0 },
    })
  )
  const result = await scan.scanDetectedSheet()
  expect(result.resultType).toEqual(ScanningResultType.Accepted)
})

test('scanDetectedSheet returns rejected ballot on invalid test mode', async () => {
  fetchMock.postOnce('scan/scanBatch', {
    body: { status: 'ok', batchId: 'test-batch' },
  })
  fetchMock.get('/scan/status', {
    scanner: ScannerStatus.ReadyToScan,
    batches: [{ id: 'test-batch', count: 1 }],
    adjudication: { adjudicated: 0, remaining: 1 },
  })
  fetchMock.getOnce(
    '/scan/hmpb/review/next-sheet',
    typedAs<GetNextReviewSheetResponse>({
      interpreted: {
        id: 'test-sheet',
        front: {
          interpretation: {
            type: 'InvalidTestModePage',
            metadata: {
              ballotStyleId: '12',
              ballotType: BallotType.Standard,
              electionHash: 'abcdef',
              isTestMode: true,
              locales: { primary: 'en-US' },
              pageNumber: 1,
              precinctId: '23',
            },
          },
          image: { url: '/not/real.jpg' },
        },
        back: {
          interpretation: interpretedHmpb({
            electionDefinition: electionSampleDefinition,
            pageNumber: 2,
          }),
          image: { url: '/not/real.jpg' },
        },
      },
    })
  )
  const result = await scan.scanDetectedSheet()
  expect(result.resultType).toEqual(ScanningResultType.Rejected)
  expect((result as RejectedScanningResult).rejectionReason).toEqual(
    RejectedScanningReason.InvalidTestMode
  )
})

test('scanDetectedSheet returns rejected ballot on invalid precinct', async () => {
  fetchMock.postOnce('scan/scanBatch', {
    body: { status: 'ok', batchId: 'test-batch' },
  })
  fetchMock.get(
    '/scan/status',
    typedAs<GetScanStatusResponse>({
      scanner: ScannerStatus.ReadyToScan,
      batches: [
        {
          id: 'test-batch',
          label: 'Batch 1',
          count: 1,
          startedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 1 },
    })
  )
  fetchMock.getOnce(
    '/scan/hmpb/review/next-sheet',
    typedAs<GetNextReviewSheetResponse>({
      interpreted: {
        id: 'test-sheet',
        front: {
          interpretation: {
            type: 'InvalidPrecinctPage',
            metadata: {
              ballotStyleId: '12',
              ballotType: BallotType.Standard,
              electionHash: 'abcdef',
              isTestMode: true,
              locales: { primary: 'en-US' },
              pageNumber: 1,
              precinctId: '23',
            },
          },
          image: { url: '/not/real.jpg' },
        },
        back: {
          interpretation: interpretedHmpb({
            electionDefinition: electionSampleDefinition,
            pageNumber: 2,
          }),
          image: { url: '/not/real.jpg' },
        },
      },
    })
  )
  const result = await scan.scanDetectedSheet()
  expect(result.resultType).toEqual(ScanningResultType.Rejected)
  expect((result as RejectedScanningResult).rejectionReason).toEqual(
    RejectedScanningReason.InvalidPrecinct
  )
})

test('scanDetectedSheet returns rejected ballot on invalid election hash', async () => {
  fetchMock.postOnce('scan/scanBatch', {
    body: { status: 'ok', batchId: 'test-batch' },
  })
  fetchMock.get(
    '/scan/status',
    typedAs<GetScanStatusResponse>({
      scanner: ScannerStatus.ReadyToScan,
      batches: [
        {
          id: 'test-batch',
          label: 'Batch 1',
          count: 1,
          startedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 1 },
    })
  )
  fetchMock.getOnce(
    '/scan/hmpb/review/next-sheet',
    typedAs<GetNextReviewSheetResponse>({
      interpreted: {
        id: 'test-sheet',
        front: {
          interpretation: {
            type: 'InvalidElectionHashPage',
            actualElectionHash: 'abcdef',
            expectedElectionHash: 'fedcba',
          },
          image: { url: '/not/real.jpg' },
        },
        back: {
          interpretation: interpretedHmpb({
            electionDefinition: electionSampleDefinition,
            pageNumber: 2,
          }),
          image: { url: '/not/real.jpg' },
        },
      },
    })
  )
  const result = await scan.scanDetectedSheet()
  expect(result.resultType).toEqual(ScanningResultType.Rejected)
  expect((result as RejectedScanningResult).rejectionReason).toEqual(
    RejectedScanningReason.InvalidElectionHash
  )
})

test('scanDetectedSheet returns rejected ballot on unreadable', async () => {
  fetchMock.postOnce('scan/scanBatch', {
    body: { status: 'ok', batchId: 'test-batch' },
  })
  fetchMock.get(
    '/scan/status',
    typedAs<GetScanStatusResponse>({
      scanner: ScannerStatus.ReadyToScan,
      batches: [
        {
          id: 'test-batch',
          label: 'Batch 1',
          count: 1,
          startedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 1 },
    })
  )
  fetchMock.getOnce(
    '/scan/hmpb/review/next-sheet',
    typedAs<GetNextReviewSheetResponse>({
      interpreted: {
        id: 'test-sheet',
        front: {
          interpretation: {
            type: 'UnreadablePage',
          },
          image: { url: '/not/real.jpg' },
        },
        back: {
          interpretation: interpretedHmpb({
            electionDefinition: electionSampleDefinition,
            pageNumber: 2,
          }),
          image: { url: '/not/real.jpg' },
        },
      },
    })
  )
  const result = await scan.scanDetectedSheet()
  expect(result.resultType).toEqual(ScanningResultType.Rejected)
  expect((result as RejectedScanningResult).rejectionReason).toEqual(
    RejectedScanningReason.Unreadable
  )
})

test('scanDetectedSheet returns ballot needs review on adjudication', async () => {
  fetchMock.postOnce('scan/scanBatch', {
    body: { status: 'ok', batchId: 'test-batch' },
  })
  fetchMock.get(
    '/scan/status',
    typedAs<GetScanStatusResponse>({
      scanner: ScannerStatus.ReadyToScan,
      batches: [
        {
          id: 'test-batch',
          label: 'Batch 1',
          count: 1,
          startedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 1 },
    })
  )
  fetchMock.getOnce(
    '/scan/hmpb/review/next-sheet',
    typedAs<GetNextReviewSheetResponse>({
      interpreted: {
        id: 'test-sheet',
        front: {
          interpretation: interpretedHmpb({
            electionDefinition: electionSampleDefinition,
            pageNumber: 2,
            adjudicationReason: AdjudicationReason.Overvote,
          }),
          image: { url: '/not/real.jpg' },
        },
        back: {
          interpretation: interpretedHmpb({
            electionDefinition: electionSampleDefinition,
            pageNumber: 2,
          }),
          image: { url: '/not/real.jpg' },
        },
      },
    })
  )
  const result = await scan.scanDetectedSheet()
  expect(result.resultType).toEqual(ScanningResultType.NeedsReview)
  expect((result as ScanningResultNeedsReview).adjudicationReasonInfo)
    .toMatchInlineSnapshot(`
    Array [
      Object {
        "contestId": "president",
        "expected": 1,
        "optionIds": Array [
          "barchi-hallaren",
          "cramer-vuocolo",
          "court-blumhardt",
          "boone-lian",
          "hildebrand-garritty",
          "patterson-lariviere",
        ],
        "type": "Overvote",
      },
    ]
  `)
})

test('acceptBallotAfterReview accepts ballot', async () => {
  fetchMock.postOnce('/scan/scanContinue', { body: { status: 'ok' } })
  expect(await scan.acceptBallotAfterReview()).toEqual(true)
})

test('acceptBallotAfterReview returns false on failure', async () => {
  fetchMock.postOnce('/scan/scanContinue', { body: { status: 'error' } })
  expect(await scan.acceptBallotAfterReview()).toEqual(false)
})

test('endBatch accepts ballot', async () => {
  fetchMock.postOnce('/scan/scanContinue', { body: { status: 'ok' } })
  expect(await scan.endBatch()).toEqual(true)
})

test('endBatch returns false on failure', async () => {
  fetchMock.postOnce('/scan/scanContinue', { body: { status: 'error' } })
  expect(await scan.endBatch()).toEqual(false)
})

test('calibrate returns true on success', async () => {
  fetchMock.postOnce('/scan/calibrate', { body: { status: 'ok' } })
  expect(await scan.calibrate()).toEqual(true)
})

test('calibrate returns false on failure', async () => {
  fetchMock.postOnce('/scan/calibrate', { body: { status: 'error' } })
  expect(await scan.calibrate()).toEqual(false)
})

test('getExport returns CVRs on success', async () => {
  const fileContent = electionWithMsEitherNeitherWithDataFiles.cvrData
  fetchMock.postOnce('/scan/export', fileContent)
  const cvrs = await scan.getExport()
  expect(cvrs).toHaveLength(100)
})

test('getExport throws on failure', async () => {
  fetchMock.postOnce('/scan/export', { status: 500, body: { status: 'error' } })
  await expect(scan.getExport()).rejects.toThrowError(
    'failed to generate scan export'
  )
})
