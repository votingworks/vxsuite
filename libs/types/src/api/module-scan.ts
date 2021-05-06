import { ISO8601Timestamp } from '.'

export interface AdjudicationStatus {
  adjudicated: number
  remaining: number
}

export interface BatchInfo {
  id: string
  startedAt: ISO8601Timestamp
  endedAt?: ISO8601Timestamp
  error?: string
  count: number
}

export interface ScanStatus {
  electionHash?: string
  batches: BatchInfo[]
  adjudication: AdjudicationStatus
}

/**
 * @url /scan/status
 * @method GET
 */
export type ScanStatusResponse = ScanStatus
