import {
  Party,
  YesNoVote,
  Candidate,
  CandidateContest,
  CandidateVote,
  Contest,
  Election,
  VotesDict,
  Vote,
} from '@votingworks/ballot-encoder'
import {
  ContestOption,
  ContestOptionTally,
  Dictionary,
  CastVoteRecord,
  CastVoteRecordLists,
  Tally,
  ContestTally,
  ContestTallyMetaDictionary,
  FullElectionTally,
  TallyCategory,
  YesNoContestOptionTally,
} from '../config/types'
import { defined } from '../utils/assert'
import {
  getBallotStyle,
  getContests,
  getEitherNeitherContests,
  expandEitherNeitherContests,
} from '../utils/election'

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

export function normalizeWriteInId(candidateId: string): string {
  if (
    candidateId.startsWith('__writein') ||
    candidateId.startsWith('__write-in') ||
    candidateId.startsWith('writein') ||
    candidateId.startsWith('write-in')
  ) {
    return writeInCandidate.id
  }

  return candidateId
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
      expandEitherNeitherContests(getContests({ ballotStyle, election })).map(
        ({ id }: { id: string }) => `${ballotStyle.id}/${id}`
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
        // TODO: tally taking ballot type into account
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _ballotType,
        _precinctId,
        _testBallot,
        _scannerId,
        _locales,
        _pageNumber,
        _pageNumbers,
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
          // let's ignore any fields that start with '_' for some level of
          // forwards-compatibility
          if (!contestId.startsWith('_')) {
            if (!ballotStyleContests.has(`${_ballotStyleId}/${contestId}`)) {
              errors.push(
                `Contest '${contestId}' in CVR is not in the election definition or is not a valid contest for ballot style '${_ballotStyleId}'`
              )
            }
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
        typeof _pageNumbers !== 'undefined'
      ) {
        errors.push(
          'Page number in CVR must be either _pageNumber, or _pageNumbers, but cannot be both.'
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

      if (
        typeof _pageNumbers !== 'undefined' &&
        (!Array.isArray(_pageNumbers) ||
          !_pageNumbers.every((pn) => typeof pn === 'number'))
      ) {
        errors.push(
          `Page numbers in CVR must be an array of number if it is set, got '${_pageNumbers}' (${typeof _pageNumbers}, not an array of numbers)`
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
        typeof _locales !== 'undefined' &&
        (typeof _locales !== 'object' ||
          !_locales ||
          typeof _locales.primary !== 'string' ||
          (typeof _locales.secondary !== 'undefined' &&
            typeof _locales.primary !== 'string'))
      ) {
        errors.push(
          `Locale in CVR must be a locale object with primary and optional secondary locales, got '${JSON.stringify(
            _locales
          )}'`
        )
      }

      yield { cvr, errors, lineNumber: lineOffset + 1 }
    }
  }
}

const buildVoteFromCvr = ({
  election,
  cvr,
}: {
  election: Election
  cvr: CastVoteRecord
}): VotesDict => {
  const vote: VotesDict = {}
  expandEitherNeitherContests(election.contests).forEach((contest) => {
    if (!cvr[contest.id]) {
      return
    }

    if (contest.type === 'yesno') {
      // the CVR is encoded the same way
      vote[contest.id] = (cvr[contest.id] as unknown) as YesNoVote
      return
    }

    if (contest.type === 'candidate') {
      vote[contest.id] = (cvr[contest.id] as string[])
        .map((candidateId) => normalizeWriteInId(candidateId))
        .map((candidateId) =>
          find(
            [writeInCandidate, ...contest.candidates],
            (c) => c.id === candidateId
          )
        )
    }
  })

  return vote
}

interface TallyParams {
  election: Election
  votes: VotesDict[]
  metadata: ContestTallyMetaDictionary
  filterContestsByParty?: string
}

export function tallyVotesByContest({
  election,
  votes,
  metadata,
  filterContestsByParty,
}: TallyParams): Dictionary<ContestTally> {
  const contestTallies: Dictionary<ContestTally> = {}
  const { contests } = election

  const districtsForParty = election.ballotStyles
    .filter((bs) => bs.partyId === filterContestsByParty)
    .flatMap((bs) => bs.districts)

  expandEitherNeitherContests(contests).forEach((contest) => {
    if (
      filterContestsByParty === undefined ||
      (districtsForParty.includes(contest.districtId) &&
        contest.partyId === filterContestsByParty)
    ) {
      let options: readonly ContestOption[] = []
      if (contest.type === 'yesno') {
        options = [['yes'], ['no']]
      }
      if (contest.type === 'candidate') {
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
      const metadataForContest = metadata[contest.id] || {
        undervotes: 0,
        overvotes: 0,
        ballots: 0,
      }

      contestTallies[contest.id] = {
        contest,
        tallies,
        metadata: metadataForContest,
      }
    }
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
}: FilterTalliesByPartyParams): Tally {
  if (!party) {
    return electionTally
  }

  const districts = election.ballotStyles
    .filter((bs) => bs.partyId === party.id)
    .flatMap((bs) => bs.districts)
  const contestIds = expandEitherNeitherContests(
    election.contests.filter(
      (contest) =>
        districts.includes(contest.districtId) && contest.partyId === party.id
    )
  ).map((contest) => contest.id)

  const filteredContestTallies: Dictionary<ContestTally> = {}
  for (const contestId in electionTally.contestTallies) {
    if (contestIds.includes(contestId))
      filteredContestTallies[contestId] =
        electionTally.contestTallies[contestId]
  }

  return {
    ...electionTally,
    contestTallies: filteredContestTallies,
  }
}

export interface GetContestTallyMetaParams {
  election: Election
  castVoteRecords: CastVoteRecord[]
  precinctId?: string
  scannerId?: string
}

export const getContestTallyMeta = ({
  election,
  castVoteRecords,
  precinctId,
  scannerId,
}: GetContestTallyMetaParams): ContestTallyMetaDictionary => {
  const filteredCVRs = castVoteRecords
    .filter((cvr) => precinctId === undefined || cvr._precinctId === precinctId)
    .filter((cvr) => scannerId === undefined || cvr._scannerId === scannerId)

  // If the CVR is malformed for this question -- only one of the pair'ed contest IDs
  // is there -- we don't want to count this as a ballot in this contest.
  getEitherNeitherContests(election.contests).forEach((c) => {
    filteredCVRs.forEach((cvr) => {
      const hasEitherNeither = cvr[c.eitherNeitherContestId] !== undefined
      const hasPickOne = cvr[c.pickOneContestId] !== undefined

      if (!(hasEitherNeither && hasPickOne)) {
        cvr[c.eitherNeitherContestId] = undefined
        cvr[c.pickOneContestId] = undefined
      }
    })
  })

  return expandEitherNeitherContests(
    election.contests
  ).reduce<ContestTallyMetaDictionary>((dictionary, contest) => {
    const contestCVRs = filteredCVRs.filter(
      (cvr) => cvr[contest.id] !== undefined
    )

    const contestVotes = contestCVRs.map(
      (cvr) => (cvr[contest.id] as unknown) as Vote
    )
    const overvotes = contestVotes.filter((vote) => {
      if (contest.type === 'candidate') {
        return vote.length > contest.seats
      }
      return vote.length > 1
    })
    const numberOfUndervotes = contestVotes.reduce((undervotes, vote) => {
      if (contest.type === 'candidate') {
        const numVotesMarked = vote.length
        if (numVotesMarked < contest.seats) {
          return undervotes + contest.seats - numVotesMarked
        }
        return undervotes
      }
      return vote.length === 0 ? undervotes + 1 : undervotes
    }, 0)
    dictionary[contest.id] = {
      ballots: contestCVRs.length,
      overvotes: overvotes.length,
      undervotes: numberOfUndervotes,
    }
    return dictionary
  }, {})
}

function getTallyForCastVoteRecords(
  election: Election,
  castVoteRecords: CastVoteRecord[],
  filterContestsByParty?: string
): Tally {
  const allVotes: VotesDict[] = []
  const cvrFiles: CastVoteRecord[] = []
  castVoteRecords.forEach((CVR) => {
    const vote = buildVoteFromCvr({ election, cvr: CVR })
    cvrFiles.push(CVR)
    allVotes.push(vote)
  })

  const contestTallyMetadata = getContestTallyMeta({
    election,
    castVoteRecords,
  })
  const overallTally = tallyVotesByContest({
    election,
    votes: allVotes,
    metadata: contestTallyMetadata,
    filterContestsByParty,
  })

  return {
    contestTallies: overallTally,
    castVoteRecords: cvrFiles,
    numberOfBallotsCounted: allVotes.length,
  }
}

function getPartyIdForCVR(
  CVR: CastVoteRecord,
  election: Election
): string | undefined {
  return election.ballotStyles.find((bs) => bs.id === CVR._ballotStyleId)
    ?.partyId
}

export function computeFullElectionTally(
  election: Election,
  castVoteRecordLists: CastVoteRecordLists
): FullElectionTally {
  const castVoteRecords = castVoteRecordLists.flat(1)

  const overallTally = getTallyForCastVoteRecords(election, castVoteRecords)

  const cvrFilesByPrecinct: Dictionary<CastVoteRecord[]> = {}
  const cvrFilesByScanner: Dictionary<CastVoteRecord[]> = {}
  const cvrFilesByParty: Dictionary<CastVoteRecord[]> = {}
  election.precincts.forEach((precinct) => {
    cvrFilesByPrecinct[precinct.id] = []
  })
  election.ballotStyles.forEach((bs) => {
    if (bs.partyId !== undefined && !(bs.partyId in cvrFilesByParty)) {
      cvrFilesByParty[bs.partyId] = []
    }
  })

  castVoteRecords.forEach((CVR) => {
    const filesForPrecinct = cvrFilesByPrecinct[CVR._precinctId]!
    filesForPrecinct.push(CVR)

    let filesForScanner = cvrFilesByScanner[CVR._scannerId]
    if (!filesForScanner) {
      cvrFilesByScanner[CVR._scannerId] = filesForScanner = []
    }
    filesForScanner.push(CVR)

    const partyForBallot = getPartyIdForCVR(CVR, election)
    if (partyForBallot !== undefined) {
      const filesForParty = cvrFilesByParty[partyForBallot]!
      filesForParty.push(CVR)
    }
  })

  const resultsByCategory = new Map<TallyCategory, Dictionary<Tally>>()
  for (const category of Object.values(TallyCategory)) {
    if (category === TallyCategory.Precinct) {
      const precinctTallyResults: Dictionary<Tally> = {}
      for (const precinctId in cvrFilesByPrecinct) {
        const CVRs = cvrFilesByPrecinct[precinctId]!
        precinctTallyResults[precinctId] = getTallyForCastVoteRecords(
          election,
          CVRs
        )
      }
      resultsByCategory.set(category, precinctTallyResults)
    }

    if (category === TallyCategory.Scanner) {
      const scannerTallyResults: Dictionary<Tally> = {}
      for (const scannerId in cvrFilesByScanner) {
        const CVRs = cvrFilesByScanner[scannerId]!
        scannerTallyResults[scannerId] = getTallyForCastVoteRecords(
          election,
          CVRs
        )
      }
      resultsByCategory.set(category, scannerTallyResults)
    }

    if (category === TallyCategory.Party) {
      const partyTallyResults: Dictionary<Tally> = {}
      for (const partyId in cvrFilesByParty) {
        const CVRs = cvrFilesByParty[partyId]!
        partyTallyResults[partyId] = getTallyForCastVoteRecords(
          election,
          CVRs,
          partyId
        )
      }
      resultsByCategory.set(category, partyTallyResults)
    }
  }

  return {
    overallTally,
    resultsByCategory,
  }
}

export function getEmptyFullElectionTally(): FullElectionTally {
  return {
    overallTally: getEmptyTally(),
    resultsByCategory: new Map(),
  }
}

export function getEmptyTally(): Tally {
  return {
    numberOfBallotsCounted: 0,
    castVoteRecords: [],
    contestTallies: {},
  }
}

export function filterTalliesByParams(
  fullElectionTally: FullElectionTally,
  election: Election,
  {
    precinctId,
    scannerId,
    partyId,
  }: { precinctId?: string; scannerId?: string; partyId?: string }
): Tally {
  const { overallTally, resultsByCategory } = fullElectionTally

  if (!scannerId && !precinctId && !partyId) {
    return overallTally
  }

  if (scannerId && !precinctId && !partyId) {
    return (
      resultsByCategory.get(TallyCategory.Scanner)?.[scannerId] ||
      getEmptyTally()
    )
  }

  if (precinctId && !scannerId && !partyId) {
    return (
      resultsByCategory.get(TallyCategory.Precinct)?.[precinctId] ||
      getEmptyTally()
    )
  }
  if (partyId && !scannerId && !precinctId) {
    return (
      resultsByCategory.get(TallyCategory.Party)?.[partyId] || getEmptyTally()
    )
  }
  const cvrFiles: CastVoteRecord[] = []
  const allVotes: VotesDict[] = []

  const precinctTally = precinctId
    ? resultsByCategory.get(TallyCategory.Precinct)?.[precinctId] ||
      getEmptyTally()
    : undefined
  const scannerTally = scannerId
    ? resultsByCategory.get(TallyCategory.Scanner)?.[scannerId] ||
      getEmptyTally()
    : undefined
  const partyTally = partyId
    ? resultsByCategory.get(TallyCategory.Party)?.[partyId] || getEmptyTally()
    : undefined

  // TODO(#2975): Once we're removing duplicate ballots, make finding the intersection of these lists more performant.
  overallTally.castVoteRecords.forEach((CVR) => {
    if (!precinctTally || precinctTally.castVoteRecords.includes(CVR)) {
      if (!scannerTally || scannerTally.castVoteRecords.includes(CVR)) {
        if (!partyTally || partyTally.castVoteRecords.includes(CVR)) {
          const vote = buildVoteFromCvr({ election, cvr: CVR })
          cvrFiles.push(CVR)
          allVotes.push(vote)
        }
      }
    }
  })

  const contestTallyMetadata = getContestTallyMeta({
    election,
    castVoteRecords: cvrFiles,
  })
  const contestTallies = tallyVotesByContest({
    election,
    votes: allVotes,
    metadata: contestTallyMetadata,
    filterContestsByParty: partyId,
  })
  return {
    contestTallies,
    castVoteRecords: cvrFiles,
    numberOfBallotsCounted: allVotes.length,
  }
}

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
  const ballotStyle = defined(
    getBallotStyle({
      ballotStyleId: castVoteRecord._ballotStyleId,
      election,
    })
  )
  if (!ballotStyle.precincts.includes(castVoteRecord._precinctId)) return
  const contestIds = expandEitherNeitherContests(
    getContests({ ballotStyle, election })
  ).map((contest) => contest.id)
  const newCVR: CastVoteRecord = {
    _precinctId: castVoteRecord._precinctId,
    _ballotStyleId: castVoteRecord._ballotStyleId,
    _ballotType: castVoteRecord._ballotType,
    _ballotId: castVoteRecord._ballotId,
    _testBallot: castVoteRecord._testBallot,
    _scannerId: castVoteRecord._scannerId,
    _pageNumber: castVoteRecord._pageNumber,
    _pageNumbers: castVoteRecord._pageNumbers,
    _locales: castVoteRecord._locales,
  }
  for (const key of contestIds) {
    if (castVoteRecord[key]) newCVR[key] = castVoteRecord[key]
  }
  return newCVR
}

interface FullTallyParams {
  election: Election
  castVoteRecords: CastVoteRecord[]
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
