import {
  AdjudicationReasonInfo,
  BallotSheetInfo,
  safeParseJSON,
} from '@votingworks/types'
import {
  CalibrateResponseSchema,
  GetNextReviewSheetResponse,
  GetScanStatusResponse,
  ScanContinueRequest,
  ScannerStatus,
} from '@votingworks/types/api/module-scan'
import { fetchJSON } from '@votingworks/utils'
import makeDebug from 'debug'
import {
  CastVoteRecord,
  RejectedScanningReason,
  ScanningResult,
  ScanningResultType,
} from '../config/types'

const debug = makeDebug('precinct-scanner:api:scan')

export interface ScannerStatusDetails {
  ballotNeedsReview: boolean
  scannerState: ScannerStatus
  ballotCount: number
}

export async function getCurrentStatus(): Promise<ScannerStatusDetails> {
  const response = await fetchJSON<GetScanStatusResponse>('/scan/status')
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

export async function scanDetectedSheet(): Promise<ScanningResult> {
  const result = await (
    await fetch('scan/scanBatch', { method: 'post' })
  ).json()

  if (result.status === 'error') {
    throw new Error(result.error)
  }

  const { batchId } = result

  for (;;) {
    const status = await fetchJSON<GetScanStatusResponse>('/scan/status')
    const batch = status.batches.find(({ id }) => id === batchId)

    if (!batch) {
      throw new Error(`batch not found: ${batchId}`)
    }

    if (batch.endedAt && status.adjudication.remaining === 0) {
      if (batch.count === 0) {
        // This can happen if the paper is yanked out during scanning.
        return {
          resultType: ScanningResultType.Rejected,
          rejectionReason: RejectedScanningReason.Unknown,
        }
      }
      return { resultType: ScanningResultType.Accepted }
    }

    const adjudicationReasons: AdjudicationReasonInfo[] = []
    if (status.adjudication.remaining > 0) {
      const sheetInfo = await fetchJSON<GetNextReviewSheetResponse>(
        '/scan/hmpb/review/next-sheet'
      )

      for (const { interpretation } of [
        sheetInfo.interpreted.front,
        sheetInfo.interpreted.back,
      ]) {
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
        if (interpretation.type === 'InvalidPrecinctPage') {
          return {
            resultType: ScanningResultType.Rejected,
            rejectionReason: RejectedScanningReason.InvalidPrecinct,
          }
        }
        if (interpretation.type === 'InterpretedHmpbPage') {
          if (interpretation.adjudicationInfo.requiresAdjudication) {
            for (const reasonInfo of interpretation.adjudicationInfo
              .allReasonInfos) {
              if (
                interpretation.adjudicationInfo.enabledReasons.includes(
                  reasonInfo.type
                )
              ) {
                adjudicationReasons.push(reasonInfo)
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
        adjudicationReasonInfo: adjudicationReasons,
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

export async function acceptBallotAfterReview(): Promise<boolean> {
  const body: ScanContinueRequest = { override: true }
  const result = await (
    await fetch('/scan/scanContinue', {
      method: 'post',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
      },
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

export async function calibrate(): Promise<boolean> {
  const response = await fetch('/scan/calibrate', {
    method: 'post',
    headers: { Accept: 'application/json' },
  })

  return (
    safeParseJSON(await response.text(), CalibrateResponseSchema).ok()
      ?.status === 'ok'
  )
}

export async function getExport(): Promise<CastVoteRecord[]> {
  const response = await fetch('/scan/export', {
    method: 'post',
  })
  if (response.status !== 200) {
    debug('failed to get scan export: %o', response)
    throw new Error('failed to generate scan export')
  }
  const castVoteRecordsString = await response.text()
  const lines = castVoteRecordsString.split('\n')
  const cvrs = lines.flatMap((line) =>
    line.length > 0 ? (JSON.parse(line) as CastVoteRecord) : []
  )
  // TODO add more validation of the CVR, move the validation code from election-manager to utils
  return cvrs.filter((cvr) => cvr._precinctId !== undefined)
}
