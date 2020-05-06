export interface Dictionary<T> {
  [key: string]: T | undefined
}

export interface CastVoteRecord extends Dictionary<string | string[]> {
  _precinctId: string
  _ballotId: string
  _ballotStyleId: string
}

export interface BatchInfo {
  id: number
  startedAt: Date
  endedAt: Date
  count: number
}
