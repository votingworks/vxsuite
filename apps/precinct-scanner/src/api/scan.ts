import { AdjudicationReason } from '@votingworks/types'
import {
  ScanStatusResponse,
  ScannerStatus,
} from '@votingworks/types/api/module-scan'
import makeDebug from 'debug'
import {
  BallotSheetInfo,
  RejectedScanningReason,
  ScanningResult,
  ScanningResultType,
} from '../config/types'
import fetchJSON from '../utils/fetchJSON'

const debug = makeDebug('precinct-scanner:api:scan')

export interface ScannerStatusDetails {
  ballotNeedsReview: boolean
  scannerState: ScannerStatus
  ballotCount: number
}

export async function getCurrentStatus(): Promise<ScannerStatusDetails> {
  const response = await fetchJSON<ScanStatusResponse>('/scan/status')
  const { scanner, batches, adjudication } = response
  const ballotCount =
    batches &&
    batches
      .filter((batch) => batch.endedAt)
      .reduce((prev, batch) => prev + batch.count, 0)
  return {
    ballotNeedsReview: adjudication.remaining > 0,
    scannerState: scanner,
    ballotCount,
  }
}

/* export const sleep = (ms = 1000): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms)) */

export async function scanDetectedSheet(): Promise<ScanningResult> {
  // code for debugging with module-scan
  /* const result = await (
    await fetch('scan/scanBatch', { method: 'post' })
  ).json()
  await sleep(5000)
  console.log('a', result)
  return ScanningResult.NeedsReview */

  const result = await (
    await fetch('scan/scanBatch', { method: 'post' })
  ).json()

  if (result.status === 'error') {
    throw new Error(result.error)
  }

  const { batchId } = result

  for (;;) {
    const status = await fetchJSON<ScanStatusResponse>('/scan/status')
    const batch = status.batches.find(({ id }) => id === batchId)

    if (!batch) {
      throw new Error(`batch not found: ${batchId}`)
    }

    if (batch.endedAt && status.adjudication.remaining === 0) {
      return { resultType: ScanningResultType.Accepted }
    }

    const adjudicationReasons: AdjudicationReason[] = []
    if (status.adjudication.remaining > 0) {
      const sheetInfo = await fetchJSON<BallotSheetInfo>(
        '/scan/hmpb/review/next-sheet'
      )

      for (const { interpretation } of [sheetInfo.front, sheetInfo.back]) {
        if (interpretation.type === 'InvalidTestModePage') {
          return {
            resultType: ScanningResultType.Rejected,
            rejectionReason: RejectedScanningReason.InvalidTestMode,
          }
        }
        if (interpretation.type === 'InvalidElectionHashPage') {
          return {
            resultType: ScanningResultType.Rejected,
            rejectionReason: RejectedScanningReason.InvalidElectionHash,
          }
        }
        if (interpretation.type === 'InterpretedHmpbPage') {
          if (interpretation.adjudicationInfo.requiresAdjudication) {
            for (const { type } of interpretation.adjudicationInfo
              .allReasonInfos) {
              if (
                interpretation.adjudicationInfo.enabledReasons.includes(type)
              ) {
                adjudicationReasons.push(type)
              }
            }
          }
        } else {
          return {
            resultType: ScanningResultType.Rejected,
            rejectionReason: RejectedScanningReason.Unreadable,
          }
        }
      }
      return {
        resultType: ScanningResultType.NeedsReview,
        adjudicationReasons,
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

export async function acceptBallotAfterReview(): Promise<boolean> {
  const data = new URLSearchParams()
  data.append('override', '1')
  const result = await (
    await fetch('/scan/scanContinue', {
      method: 'post',
      body: data,
    })
  ).json()
  if (result.status !== 'ok') {
    debug('could not scan: %o', result)
    return false
  }
  return true
}

export async function endBatch(): Promise<boolean> {
  // calling scanContinue will "naturally" end the batch because module-scan
  // will see there's no more paper
  const result = await (
    await fetch('/scan/scanContinue', { method: 'post' })
  ).json()
  if (result.status !== 'ok') {
    debug('failed to end batch: %o', result)
    return false
  }
  return true
}
