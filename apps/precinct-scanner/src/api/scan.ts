import {
  ScanStatusResponse,
  ScannerStatus,
} from '@votingworks/types/api/module-scan'
import { ScanningResult } from '../config/types'
import fetchJSON from '../utils/fetchJSON'

export interface ScannerStatusDetails {
  scannerState: ScannerStatus
  ballotCount: number
}

export async function getCurrentStatus(): Promise<ScannerStatusDetails> {
  const response = await fetchJSON<ScanStatusResponse>('/scan/status')
  const { scanner, batches } = response
  const ballotCount =
    batches && batches.reduce((prev, batch) => prev + batch.count, 0)
  return {
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
    await fetch('scan/scanSingle', { method: 'post' })
  ).json()
  if (result.status === 'ok') {
    return ScanningResult.Accepted
  }
  if (result.status === 'RequiresAdjudication') {
    return ScanningResult.NeedsReview
  }
  return ScanningResult.Rejected
}

export async function acceptBallotAfterReview(): Promise<boolean> {
  const data = new URLSearchParams()
  data.append('override', '1')
  const result = await (
    await fetch('scan/scanContinue', {
      method: 'post',
      body: data,
    })
  ).json()
  if (result.status !== 'ok') {
    // eslint-disable-next-line no-console
    console.error('could not scan: ', result.status)
    return false
  }
  return true
}
