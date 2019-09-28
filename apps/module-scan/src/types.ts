export interface Dictionary<T> {
  [key: string]: T | undefined
}

export type CastVoteRecord = Dictionary<string | string[]>

export interface CVRCallbackParams {
  ballotImagePath: string
  cvr?: CastVoteRecord
}
export type CVRCallbackFunction = (arg0: CVRCallbackParams) => void

export interface BatchInfo {
  id: number
  startedAt: Date
  endedAt: Date
  count: number
}
