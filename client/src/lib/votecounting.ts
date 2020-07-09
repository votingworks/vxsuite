import {
  Party,
  YesNoVote,
  Candidate,
  CandidateContest,
  CandidateVote,
  Contest,
  Election,
  VotesDict,
} from '@votingworks/ballot-encoder'
import {
  ContestOption,
  ContestOptionTally,
  Dictionary,
  FullElectionTally,
  VotesByFilter,
  CastVoteRecord,
  VotesByFunction,
  Tally,
  ContestTally,
  YesNoContestOptionTally,
} from '../config/types'
import { getBallotStyle, getContests } from '../utils/election'

import find from '../utils/find'

// the generic write-in candidate to keep count
const writeInCandidate: Candidate = {
  id: '__write-in',
  name: 'Write-In',
  isWriteIn: true,
}

export interface ParseCastVoteRecordResult {
  cvr: CastVoteRecord
  errors: string[]
  lineNumber: number
}

// CVRs are newline-separated JSON objects
export function* parseCVRs(
  castVoteRecordsString: string,
  election: Election
): Generator<ParseCastVoteRecordResult> {
  const ballotStyleIds = new Set(election.ballotStyles.map(({ id }) => id))
  const precinctIds = new Set(election.precincts.map(({ id }) => id))
  const ballotStyleContests = new Set(
    election.ballotStyles.flatMap((ballotStyle) =>
      getContests({ ballotStyle, election }).map(
        ({ id }) => `${ballotStyle.id}/${id}`
      )
    )
  )

  const lines = castVoteRecordsString.split('\n')

  for (const [lineOffset, line] of lines.entries()) {
    if (line) {
      const cvr = JSON.parse(line) as CastVoteRecord
      const errors: string[] = []
      const {
        _ballotId,
        _ballotStyleId,
        _precinctId,
        _testBallot,
        _scannerId,
        _locale,
        _pageNumber,
        ...votes
      } = cvr

      if (!ballotStyleIds.has(_ballotStyleId)) {
        errors.push(
          `Ballot style '${_ballotStyleId}' in CVR is not in the election definition`
        )
      }

      if (!precinctIds.has(_precinctId)) {
        errors.push(
          `Precinct '${_precinctId}' in CVR is not in the election definition`
        )
      }

      for (const contestId in votes as VotesDict) {
        if (Object.prototype.hasOwnProperty.call(votes, contestId)) {
          if (!ballotStyleContests.has(`${_ballotStyleId}/${contestId}`)) {
            errors.push(
              `Contest '${contestId}' in CVR is not in the election definition or is not a valid contest for ballot style '${_ballotStyleId}'`
            )
          }
        }
      }

      if (typeof _testBallot !== 'boolean') {
        errors.push(
          `CVR test ballot flag must be true or false, got '${_testBallot}' (${typeof _testBallot}, not boolean)`
        )
      }

      if (
        typeof _pageNumber !== 'undefined' &&
        typeof _pageNumber !== 'number'
      ) {
        errors.push(
          `Page number in CVR must be a number if it is set, got '${_pageNumber}' (${typeof _pageNumber}, not number)`
        )
      }

      if (typeof _ballotId !== 'string') {
        errors.push(
          `Ballot ID in CVR must be a string, got '${_ballotId}' (${typeof _ballotId}, not string)`
        )
      }

      if (typeof _scannerId !== 'string') {
        errors.push(
          `Scanner ID in CVR must be a string, got '${_scannerId}' (${typeof _scannerId}, not string)`
        )
      }

      if (
        typeof _locale !== 'undefined' &&
        (typeof _locale !== 'object' ||
          !_locale ||
          typeof _locale.primary !== 'string' ||
          (typeof _locale.secondary !== 'undefined' &&
            typeof _locale.primary !== 'string'))
      ) {
        errors.push(
          `Locale in CVR must be a locale object with primary and optional secondary locales, got '${JSON.stringify(
            _locale
          )}'`
        )
      }

      yield { cvr, errors, lineNumber: lineOffset + 1 }
    }
  }
}

export const getVotesByPrecinct: VotesByFunction = ({
  election,
  castVoteRecords,
}) => {
  const votesByPrecinct: VotesByFilter = {}
  castVoteRecords.forEach((CVR) => {
    const vote: VotesDict = {}
    election.contests.forEach((contest) => {
      if (!CVR[contest.id]) {
        return
      }

      if (contest.type === 'yesno') {
        // the CVR is encoded the same way
        vote[contest.id] = CVR[contest.id] as YesNoVote
        return
      }

      if (contest.type === 'candidate') {
        vote[contest.id] = (CVR[contest.id] as string[]).map((candidateId) =>
          find(
            [writeInCandidate, ...contest.candidates],
            (c) => c.id === candidateId
          )
        )
      }
    })

    let votes = votesByPrecinct[CVR._precinctId]
    if (!votes) {
      votesByPrecinct[CVR._precinctId] = votes = []
    }

    votes.push(vote)
  })

  return votesByPrecinct
}

export const getVotesByScanner: VotesByFunction = ({
  election,
  castVoteRecords,
}) => {
  const votesByScanner: VotesByFilter = {}
  castVoteRecords.forEach((CVR) => {
    const vote: VotesDict = {}
    election.contests.forEach((contest) => {
      if (!CVR[contest.id]) {
        return
      }

      if (contest.type === 'yesno') {
        // the CVR is encoded the same way
        vote[contest.id] = CVR[contest.id] as YesNoVote
        return
      }

      if (contest.type === 'candidate') {
        vote[contest.id] = (CVR[contest.id] as string[]).map((candidateId) =>
          find(
            [writeInCandidate, ...contest.candidates],
            (c) => c.id === candidateId
          )
        )
      }
    })

    let votes = votesByScanner[CVR._scannerId]
    if (!votes) {
      votesByScanner[CVR._scannerId] = votes = []
    }

    votes.push(vote)
  })

  return votesByScanner
}

interface TallyParams {
  election: Election
  precinctId?: string
  scannerId?: string
  votes: VotesDict[]
}

export function tallyVotesByContest({
  election,
  votes,
}: TallyParams): ContestTally[] {
  const contestTallies: ContestTally[] = []

  election.contests.forEach((contest) => {
    let options: ContestOption[]
    if (contest.type === 'yesno') {
      options = [['yes'], ['no']]
    } else {
      options = contest.candidates
    }

    const tallies: ContestOptionTally[] = options
      .map((option) => {
        return { option, tally: 0 }
      })
      .concat(
        contest.type === 'candidate' && contest.allowWriteIns
          ? [{ option: writeInCandidate, tally: 0 }]
          : []
      )

    votes.forEach((vote) => {
      const selected = vote[contest.id]
      if (!selected) {
        return
      }

      // overvotes & undervotes
      const maxSelectable =
        contest.type === 'yesno' ? 1 : (contest as CandidateContest).seats
      if (selected.length > maxSelectable || selected.length === 0) {
        return
      }

      if (contest.type === 'yesno') {
        const optionTally = find(tallies, (optionTally) => {
          return (
            (optionTally as YesNoContestOptionTally).option[0] === selected[0]
          )
        })
        optionTally.tally += 1
      } else {
        ;(selected as CandidateVote).forEach((selectedOption) => {
          const optionTally = find(tallies, (optionTally) => {
            const candidateOption = optionTally.option as Candidate
            const selectedCandidateOption = selectedOption as Candidate
            return candidateOption.id === selectedCandidateOption.id
          })
          optionTally.tally += 1
        })
      }
    })

    contestTallies.push({ contest, tallies })
  })

  return contestTallies
}

interface FilterTalliesByPartyParams {
  election: Election
  electionTally: Tally
  party?: Party
}

// TODO: How to use type of electionTally as the return type
export function filterTalliesByParty({
  election,
  electionTally,
  party,
}: FilterTalliesByPartyParams) {
  if (!party) {
    return electionTally
  }

  const districts = election.ballotStyles
    .filter((bs) => bs.partyId === party.id)
    .flatMap((bs) => bs.districts)
  const contestIds = election.contests
    .filter(
      (contest) =>
        districts.includes(contest.districtId) && contest.partyId === party.id
    )
    .map((contest) => contest.id)

  return {
    ...electionTally,
    contestTallies: electionTally.contestTallies.filter((contestTally) =>
      contestIds.includes(contestTally.contest.id)
    ),
  }
}

interface FullTallyParams {
  election: Election
  castVoteRecords: CastVoteRecord[]
}

export function fullTallyVotes({
  election,
  castVoteRecords,
}: FullTallyParams): FullElectionTally {
  const votesByPrecinct = getVotesByPrecinct({
    election,
    castVoteRecords,
  })
  const votesByScanner = getVotesByScanner({
    election,
    castVoteRecords,
  })

  const scannerTallies: Dictionary<Tally> = {}
  const precinctTallies: Dictionary<Tally> = {}

  let allVotes: VotesDict[] = []

  for (const precinctId in votesByPrecinct) {
    const votes = votesByPrecinct[precinctId]!
    precinctTallies[precinctId] = {
      precinctId,
      contestTallies: tallyVotesByContest({
        election,
        votes,
      }),
    }
    allVotes = [...allVotes, ...votes]
  }
  for (const scannerId in votesByScanner) {
    const votes = votesByScanner[scannerId]!
    scannerTallies[scannerId] = {
      scannerId,
      contestTallies: tallyVotesByContest({
        election,
        votes,
      }),
    }
  }

  const overallTally = tallyVotesByContest({ election, votes: allVotes })

  return {
    scannerTallies,
    precinctTallies,
    overallTally: {
      contestTallies: overallTally,
    },
  }
}

export interface ContestTallyMeta {
  overvotes: number
  undervotes: number
  ballots: number
}

export const getContestTallyMeta = ({
  election,
  castVoteRecords,
}: FullTallyParams) =>
  election.contests.reduce<Dictionary<ContestTallyMeta>>(
    (dictionary, contest) => {
      const contestCVRs = castVoteRecords.filter(
        (cvr) => cvr[contest.id] !== undefined
      )
      const contestVotes = contestCVRs.map((cvr) => cvr[contest.id])
      const overvotes = contestVotes.filter((vote) => {
        if (contest.type === 'yesno') {
          return (vote as YesNoVote).length > 1
        }
        if (contest.type === 'candidate') {
          return ((vote as unknown) as CandidateVote).length > contest.seats
        }
        return false
      })
      const undervotes = contestVotes.filter((vote) => {
        if (contest.type === 'yesno') {
          return (vote as YesNoVote).length === 0
        }
        if (contest.type === 'candidate') {
          return ((vote as unknown) as CandidateVote).length < contest.seats
        }
        return false
      })
      dictionary[contest.id] = {
        ballots: contestCVRs.length,
        overvotes: overvotes.length,
        undervotes: undervotes.length,
      }
      return dictionary
    },
    {}
  )

//
// some different ideas on tabulation, starting with the overvote report
//

export interface Pair<T> {
  first: T
  second: T
}

const makePairs = <T>(inputArray: T[]): Pair<T>[] => {
  const pairs = []
  for (let i = 0; i < inputArray.length; i++) {
    for (let j = i + 1; j < inputArray.length; j++) {
      pairs.push({ first: inputArray[i], second: inputArray[j] })
    }
  }

  return pairs
}

export interface OvervotePairTally {
  candidates: Pair<Candidate>
  tally: number
}

export interface ContestOvervotePairTallies {
  contest: Contest
  tallies: OvervotePairTally[]
}

const findOvervotePairTally = (
  pairTallies: OvervotePairTally[],
  pair: Pair<Candidate>
): OvervotePairTally | undefined => {
  for (const pairTally of pairTallies) {
    if (
      (pairTally.candidates.first === pair.first &&
        pairTally.candidates.second === pair.second) ||
      (pairTally.candidates.first === pair.second &&
        pairTally.candidates.second === pair.first)
    ) {
      return pairTally
    }
  }
}

// filters the CVR so it doesn't contain contests it shouldn't (TODO: should we cancel it altogether if it does?)
interface ProcessCastVoteRecordParams {
  election: Election
  castVoteRecord: CastVoteRecord
}

const processCastVoteRecord = ({
  election,
  castVoteRecord,
}: ProcessCastVoteRecordParams): CastVoteRecord | undefined => {
  const ballotStyle = getBallotStyle({
    ballotStyleId: castVoteRecord._ballotStyleId,
    election,
  })
  if (!ballotStyle.precincts.includes(castVoteRecord._precinctId)) return
  const contestIds = getContests({ ballotStyle, election }).map(
    (contest) => contest.id
  )
  const newCVR: CastVoteRecord = {
    _precinctId: castVoteRecord._precinctId,
    _ballotStyleId: castVoteRecord._ballotStyleId,
    _ballotId: castVoteRecord._ballotId,
    _testBallot: castVoteRecord._testBallot,
    _scannerId: castVoteRecord._scannerId,
    _pageNumber: castVoteRecord._pageNumber,
    _locale: castVoteRecord._locale,
  }
  for (const key of contestIds) {
    if (castVoteRecord[key]) newCVR[key] = castVoteRecord[key]
  }
  return newCVR
}

export const getOvervotePairTallies = ({
  election,
  castVoteRecords,
}: FullTallyParams): Dictionary<ContestOvervotePairTallies> => {
  const overvotePairTallies: Dictionary<ContestOvervotePairTallies> = election.contests
    .filter((contest) => contest.type === 'candidate')
    .reduce(
      (result, contest) => ({
        ...result,
        [contest.id]: { contest, tallies: [] },
      }),
      {}
    )

  for (const cvr of castVoteRecords) {
    const safeCVR = processCastVoteRecord({ election, castVoteRecord: cvr })
    if (!safeCVR) continue // eslint-disable-line no-continue

    for (const contestId in safeCVR) {
      const contestOvervotePairTallies = overvotePairTallies[contestId]
      if (!contestOvervotePairTallies) continue // eslint-disable-line no-continue

      const candidateContest = contestOvervotePairTallies.contest as CandidateContest
      const selected = safeCVR[contestId] as string[]

      if (!selected || selected.length <= candidateContest.seats) continue // eslint-disable-line no-continue

      const candidates = candidateContest.candidates.filter((c) =>
        selected.includes(c.id)
      )
      const overvotePairs = makePairs(candidates)

      for (const pair of overvotePairs) {
        let pairTally = findOvervotePairTally(
          contestOvervotePairTallies.tallies,
          pair
        )
        if (!pairTally) {
          pairTally = { candidates: pair, tally: 0 }
          contestOvervotePairTallies.tallies.push(pairTally)
        }

        pairTally.tally += 1
      }
    }
  }

  return overvotePairTallies
}

type CVRCategorizer = (cvr: CastVoteRecord) => string

interface VoteCountsByCategoryParams {
  castVoteRecords: CastVoteRecord[][]
  categorizers: Dictionary<CVRCategorizer>
}

export const CVRCategorizerByPrecinct: CVRCategorizer = (cvr: CastVoteRecord) =>
  cvr._precinctId
export const CVRCategorizerByScanner: CVRCategorizer = (cvr: CastVoteRecord) =>
  cvr._scannerId

export const voteCountsByCategory = ({
  castVoteRecords,
  categorizers,
}: VoteCountsByCategoryParams): Dictionary<Dictionary<number>> => {
  const counts: Dictionary<Dictionary<number>> = {}
  for (const category in categorizers) {
    counts[category] = {}
  }

  for (const cvrArray of castVoteRecords) {
    for (const cvr of cvrArray) {
      for (const category in categorizers) {
        const categorizer = categorizers[category]
        const categoryValue = categorizer!(cvr)
        const count = counts[category]!

        count[categoryValue] = (count[categoryValue] || 0) + 1
      }
    }
  }

  return counts
}
