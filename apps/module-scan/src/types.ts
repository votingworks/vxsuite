export interface Dictionary<T> {
  [key: string]: T | undefined
}

export interface BallotStyle {
  readonly id: string
  readonly partyId?: string
  readonly precincts: string[]
  readonly districts: string[]
}

export interface Candidate {
  readonly id: string
  readonly name: string
  readonly partyId?: string
  isWriteIn?: boolean
}
export type OptionalCandidate = Candidate | undefined

export type ContestTypes = 'candidate' | 'yesno'

export interface Contest {
  readonly id: string
  readonly districtId: string
  readonly partyId?: string
  readonly section: string
  readonly title: string
  readonly type: ContestTypes
}
export interface CandidateContest extends Contest {
  readonly type: 'candidate'
  readonly seats: number
  readonly candidates: Candidate[]
  readonly allowWriteIns: boolean
}
export interface YesNoContest extends Contest {
  readonly type: 'yesno'
  readonly description: string
  readonly shortTitle: string
}
export type Contests = (CandidateContest | YesNoContest)[]

export type Ballot = Dictionary<string | string[]>

export type BallotCallbackFunction = (path: string, ballot: Ballot) => void

export interface Party {
  readonly id: string
  readonly name: string
  readonly abbrev: string
}
export type Parties = Party[]

export interface Precinct {
  readonly id: string
  readonly name: string
}
export interface District {
  readonly id: string
  readonly name: string
}

export interface Election {
  readonly ballotStyles: BallotStyle[]
  readonly parties: Parties
  readonly precincts: Precinct[]
  readonly districts: District[]
  readonly contests: Contests
  readonly county: string
  readonly date: string
  readonly seal: string
  readonly state: string
  readonly title: string
}
