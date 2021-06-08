import { Dictionary, Optional } from './generic'

export type Translations = Record<string, Record<string, string> | undefined>

// Candidates
export interface Candidate {
  readonly id: string
  readonly name: string
  readonly partyId?: string
  readonly isWriteIn?: boolean
}
export const writeInCandidate: Candidate = {
  id: '__write-in',
  name: 'Write-In',
  isWriteIn: true,
}
export type OptionalCandidate = Optional<Candidate>

// Contests
export type ContestTypes = 'candidate' | 'yesno' | 'ms-either-neither'
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
  readonly candidates: readonly Candidate[]
  readonly allowWriteIns: boolean
}
export interface YesNoOption {
  readonly id: string
  readonly label: string
}
export interface YesNoContest extends Contest {
  readonly type: 'yesno'
  readonly description: string
  readonly shortTitle?: string
  readonly yesOption?: YesNoOption
  readonly noOption?: YesNoOption
}
export interface MsEitherNeitherContest extends Contest {
  readonly type: 'ms-either-neither'
  readonly eitherNeitherContestId: string
  readonly pickOneContestId: string
  readonly description: string
  readonly eitherNeitherLabel: string
  readonly pickOneLabel: string
  readonly eitherOption: YesNoOption
  readonly neitherOption: YesNoOption
  readonly firstOption: YesNoOption
  readonly secondOption: YesNoOption
}
export type AnyContest =
  | CandidateContest
  | YesNoContest
  | MsEitherNeitherContest

export type Contests = readonly AnyContest[]

// Election
export interface BallotStyle {
  readonly id: string
  readonly precincts: readonly string[]
  readonly districts: readonly string[]
  readonly partyId?: string
}
export interface Party {
  readonly id: string
  readonly name: string
  readonly fullName: string
  readonly abbrev: string
}
export type Parties = readonly Party[]
export interface Precinct {
  readonly id: string
  readonly name: string
}
export interface District {
  readonly id: string
  readonly name: string
}
export interface County {
  readonly id: string
  readonly name: string
}

export interface BallotLocale {
  readonly primary: string
  readonly secondary?: string
}

export type BallotStrings = Record<string, string | Translations>

export enum BallotPaperSize {
  Letter = 'letter',
  Legal = 'legal',
}

interface BallotLayout {
  paperSize: BallotPaperSize
}

export interface Election {
  readonly _lang?: Translations
  readonly adjudicationReasons?: readonly AdjudicationReason[]
  readonly ballotLayout?: BallotLayout
  readonly ballotStrings?: BallotStrings
  readonly ballotStyles: readonly BallotStyle[]
  readonly contests: Contests
  readonly county: County
  readonly date: string
  readonly districts: readonly District[]
  readonly markThresholds?: MarkThresholds
  readonly parties: Parties
  readonly precincts: readonly Precinct[]
  readonly seal?: string
  readonly sealURL?: string
  readonly state: string
  readonly title: string
}
export type OptionalElection = Optional<Election>
export interface ElectionDefinition {
  election: Election
  electionData: string
  electionHash: string
}
export type OptionalElectionDefinition = Optional<ElectionDefinition>

// Votes
export type CandidateVote = readonly Candidate[]
export type YesOrNo = Exclude<YesNoVote[0] | YesNoVote[1], undefined>
export type YesNoVote =
  | readonly ['yes']
  | readonly ['no']
  | readonly ['yes', 'no']
  | readonly ['no', 'yes']
  | readonly []
export type OptionalYesNoVote = Optional<YesNoVote>
export type Vote = CandidateVote | YesNoVote
export type OptionalVote = Optional<Vote>
export type VotesDict = Dictionary<Vote>

export enum BallotType {
  Standard = 0,
  Absentee = 1,
  Provisional = 2,
}

// Hand-marked paper & adjudication
export interface MarkThresholds {
  readonly marginal: number
  readonly definite: number
}

export enum AdjudicationReason {
  UninterpretableBallot = 'UninterpretableBallot',
  MarginalMark = 'MarginalMark',
  Overvote = 'Overvote',
  Undervote = 'Undervote',
  WriteIn = 'WriteIn',
  BlankBallot = 'BlankBallot',
}

// Updating this value is a breaking change.
export const BallotTypeMaximumValue = (1 << 4) - 1

export interface CompletedBallot {
  readonly electionHash: string
  readonly ballotStyleId: BallotStyle['id']
  readonly precinctId: Precinct['id']
  readonly ballotId: string
  readonly votes: VotesDict
  readonly isTestMode: boolean
  readonly ballotType: BallotType
}

// Smart Card Content
export type CardDataTypes = 'voter' | 'pollworker' | 'admin'
export interface CardData {
  readonly t: CardDataTypes
}
export interface VoterCardData extends CardData {
  readonly t: 'voter'
  readonly c: number // created date
  readonly bs: string // ballot style id
  readonly pr: string // precinct id
  readonly uz?: number // used (voided)
  readonly bp?: number // ballot printed date
  readonly u?: number // updated date
  readonly m?: string // mark machine id
}
export interface PollworkerCardData extends CardData {
  readonly t: 'pollworker'
  readonly h: string
}
export interface AdminCardData extends CardData {
  readonly t: 'admin'
  readonly h: string
}
export type AnyCardData = VoterCardData | PollworkerCardData | AdminCardData

/**
 * Gets contests which belong to a ballot style in an election.
 */
export const getContests = ({
  ballotStyle,
  election,
}: {
  ballotStyle: BallotStyle
  election: Election
}): Contests =>
  election.contests.filter(
    (c) =>
      ballotStyle.districts.includes(c.districtId) &&
      ballotStyle.partyId === c.partyId
  )

/**
 * Get all MS either-neither contests.
 */
export const getEitherNeitherContests = (
  contests: Contests
): MsEitherNeitherContest[] => {
  return contests.filter(
    (c): c is MsEitherNeitherContest => c.type === 'ms-either-neither'
  )
}

export const expandEitherNeitherContests = (
  contests: Contests
): Exclude<AnyContest, MsEitherNeitherContest>[] => {
  return contests.flatMap((contest) =>
    contest.type !== 'ms-either-neither'
      ? [contest]
      : [
          {
            type: 'yesno',
            id: contest.eitherNeitherContestId,
            title: `${contest.title} – Either/Neither`,
            districtId: contest.districtId,
            section: contest.section,
            description: contest.description,
            yesOption: contest.eitherOption,
            noOption: contest.neitherOption,
          },
          {
            type: 'yesno',
            id: contest.pickOneContestId,
            title: `${contest.title} – Pick One`,
            districtId: contest.districtId,
            section: contest.section,
            description: contest.description,
            yesOption: contest.firstOption,
            noOption: contest.secondOption,
          },
        ]
  )
}

/**
 * Retrieves a precinct by id.
 */
export const getPrecinctById = ({
  election,
  precinctId,
}: {
  election: Election
  precinctId: string
}): Precinct | undefined => election.precincts.find((p) => p.id === precinctId)

/**
 * Retrieves a ballot style by id.
 */
export const getBallotStyle = ({
  ballotStyleId,
  election,
}: {
  ballotStyleId: string
  election: Election
}): BallotStyle | undefined =>
  election.ballotStyles.find((bs) => bs.id === ballotStyleId)

/**
 * Retrieve a contest from a set of contests based on ID
 * special-cases Ms Either Neither contests
 */
export const findContest = ({
  contests,
  contestId,
}: {
  contests: Contests
  contestId: string
}): AnyContest | undefined => {
  return contests.find((c) =>
    c.type === 'ms-either-neither'
      ? c.eitherNeitherContestId === contestId ||
        c.pickOneContestId === contestId
      : c.id === contestId
  )
}

/**
 * Validates the votes for a given ballot style in a given election.
 *
 * @throws When an inconsistency is found.
 */
export const validateVotes = ({
  votes,
  ballotStyle,
  election,
}: {
  votes: VotesDict
  ballotStyle: BallotStyle
  election: Election
}): void => {
  const contests = getContests({ election, ballotStyle })

  for (const contestId of Object.getOwnPropertyNames(votes)) {
    const contest = findContest({ contests, contestId })

    if (!contest) {
      throw new Error(
        `found a vote with contest id ${JSON.stringify(
          contestId
        )}, but no such contest exists in ballot style ${
          ballotStyle.id
        } (expected one of ${contests.map((c) => c.id).join(', ')})`
      )
    }
  }
}

/**
 * @deprecated Does not support i18n. 'party.fullname` should be used instead.
 * Gets the adjective used to describe the political party for a primary
 * election, e.g. "Republican" or "Democratic".
 */
export const getPartyPrimaryAdjectiveFromBallotStyle = ({
  ballotStyleId,
  election,
}: {
  ballotStyleId: string
  election: Election
}): string => {
  const parts = ballotStyleId && /(\d+)(\w+)/i.exec(ballotStyleId)
  const abbrev = parts && parts[2]
  const party = abbrev && election.parties.find((p) => p.abbrev === abbrev)
  const name = party && party.name
  return (name === 'Democrat' && 'Democratic') || name || ''
}

/**
 * Gets the full name of the political party for a primary election,
 * e.g. "Republican Party" or "Democratic Party".
 */
export const getPartyFullNameFromBallotStyle = ({
  ballotStyleId,
  election,
}: {
  ballotStyleId: string
  election: Election
}): string => {
  const ballotStyle = getBallotStyle({ ballotStyleId, election })
  const party = election.parties.find((p) => p.id === ballotStyle?.partyId)
  return party?.fullName ?? ''
}

/**
 * Helper function to build a `VotesDict` more easily, primarily for testing.
 *
 * @param contests The contests the voter voted in, probably from `getContests`.
 * @param shorthand A mapping of contest id to "vote", where a vote can be a
 * `Vote`, the string id of a candidate, multiple string ids for candidates, or
 * just a `Candidate` by itself.
 *
 * @example
 *
 * // Vote by candidate id.
 * vote(contests, { president: 'boone-lian' })
 *
 * // Vote by yesno contest.
 * vote(contests, { 'question-a': 'yes' })
 *
 * // Multiple votes.
 * vote(contests, {
 *   president: 'boone-lian',
 *   'question-a': 'yes'
 * })
 *
 * // Multiple candidate selections.
 * vote(contests, {
 *   'city-council': ['rupp', 'davis']
 * })
 */
export function vote(
  contests: Contests,
  shorthand: {
    [key: string]: Vote | string | readonly string[] | Candidate
  }
): VotesDict {
  return Object.getOwnPropertyNames(shorthand).reduce((result, contestId) => {
    const contest = findContest({ contests, contestId })

    if (!contest) {
      throw new Error(`unknown contest ${contestId}`)
    }

    const choice = shorthand[contestId]

    if (contest.type !== 'candidate') {
      return { ...result, [contestId]: choice }
    } else {
      if (Array.isArray(choice) && typeof choice[0] === 'string') {
        return {
          ...result,
          [contestId]: contest.candidates.filter((c) =>
            (choice as readonly string[]).includes(c.id)
          ),
        }
      }

      if (typeof choice === 'string') {
        return {
          ...result,
          [contestId]: [contest.candidates.find((c) => c.id === choice)],
        }
      }

      return {
        ...result,
        [contestId]: Array.isArray(choice) ? choice : [choice],
      }
    }
  }, {})
}

export function isVotePresent(vote?: Vote): boolean {
  return !!vote && vote.length > 0
}

/**
 * Helper function to get array of locale codes used in election definition.
 */
export const getElectionLocales = (
  election: Election,
  baseLocale = 'en-US'
): string[] =>
  election._lang ? [baseLocale, ...Object.keys(election._lang)] : [baseLocale]

/**
 * Copies an election definition preferring strings from the matching locale.
 */
export function withLocale(election: Election, locale: string): Election {
  return copyWithLocale(election, locale)
}

function copyWithLocale<T>(value: T, locale: string): T
function copyWithLocale<T>(value: readonly T[], locale: string): readonly T[]
function copyWithLocale<T>(
  value: T | readonly T[],
  locale: string
): T | readonly T[] {
  if (Array.isArray(value)) {
    return value.map(
      (element) => (copyWithLocale(element, locale) as unknown) as T
    )
  }

  if (typeof value === 'undefined') {
    return value
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const lang = '_lang' in record && (record['_lang'] as Translations)

    if (!lang) {
      return value
    }

    const stringsEntry = Object.entries(lang).find(
      ([key]) => key.toLowerCase() === locale.toLowerCase()
    )

    if (!stringsEntry || !stringsEntry[1]) {
      return value
    }

    const strings = stringsEntry[1]
    const result: Record<string, unknown> = {}

    for (const [key, val] of Object.entries(record)) {
      if (key === '_lang') {
        continue
      }

      if (key in strings) {
        result[key] = strings[key]
      } else {
        result[key] = copyWithLocale(val, locale)
      }
    }

    return result as T
  }

  return value
}
