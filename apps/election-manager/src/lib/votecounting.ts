import {
  Candidate,
  CandidateContest,
  CandidateVote,
  Contest,
  Election,
  Party,
  Vote,
  VotesDict,
  YesNoVote,
  getBallotStyle,
  getContests,
  getEitherNeitherContests,
  Dictionary,
} from '@votingworks/types'
import { strict as assert } from 'assert'
import {
  ContestOptionTally,
  CastVoteRecord,
  CastVoteRecordLists,
  Tally,
  ContestTally,
  ContestTallyMetaDictionary,
  FullElectionTally,
  TallyCategory,
  YesNoOption,
  ContestOption,
  VotingMethod,
} from '../config/types'
import {
  expandEitherNeitherContests,
  writeInCandidate,
  getDistrictIdsForPartyId,
} from '../utils/election'

import find from '../utils/find'

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
            } else {
              const selectedChoices = votes[contestId] as string[]
              const contest = expandEitherNeitherContests(
                election.contests
              ).find((c) => c.id === contestId)!
              for (const selectedChoice of selectedChoices) {
                switch (contest.type) {
                  case 'candidate': {
                    const isValidCandidate = contest.candidates
                      .map((c) => c.id)
                      .includes(selectedChoice)
                    const isValidWriteInCandidate =
                      contest.allowWriteIns &&
                      normalizeWriteInId(selectedChoice) === writeInCandidate.id
                    if (!(isValidCandidate || isValidWriteInCandidate)) {
                      errors.push(
                        `Candidate ID '${selectedChoice}' in CVR is not a valid candidate choice for contest: '${contestId}'`
                      )
                    }
                    break
                  }
                  case 'yesno': {
                    if (!['yes', 'no', ''].includes(selectedChoice)) {
                      errors.push(
                        `Choice '${selectedChoice}' in CVR is not a valid contest choice for yes no contest: ${contestId}`
                      )
                    }
                  }
                }
              }
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

  // If the CVR is malformed for this question -- only one of the pair'ed contest IDs
  // is there -- we don't want to count this as a ballot in this contest.
  getEitherNeitherContests(election.contests).forEach((c) => {
    const hasEitherNeither = cvr[c.eitherNeitherContestId] !== undefined
    const hasPickOne = cvr[c.pickOneContestId] !== undefined

    if (!(hasEitherNeither && hasPickOne)) {
      cvr[c.eitherNeitherContestId] = undefined
      cvr[c.pickOneContestId] = undefined
    }
  })

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

export function getTallyForContestOption(
  option: ContestOption,
  tallies: Dictionary<ContestOptionTally>,
  contest: Contest
): ContestOptionTally {
  switch (contest.type) {
    case 'candidate':
      return tallies[(option as Candidate).id]!
    case 'yesno': {
      const yesnooption = option as YesNoOption
      assert(yesnooption.length === 1)
      return tallies[yesnooption[0]]!
    }
    default:
      throw new Error(`Unexpected contest type: ${contest.type}`)
  }
}

interface TallyParams {
  election: Election
  votes: VotesDict[]
  filterContestsByParty?: string
}

export function tallyVotesByContest({
  election,
  votes,
  filterContestsByParty,
}: TallyParams): Dictionary<ContestTally> {
  const contestTallies: Dictionary<ContestTally> = {}
  const { contests } = election

  const districtsForParty = filterContestsByParty
    ? getDistrictIdsForPartyId(election, filterContestsByParty)
    : []

  expandEitherNeitherContests(contests).forEach((contest) => {
    if (
      filterContestsByParty === undefined ||
      (districtsForParty.includes(contest.districtId) &&
        contest.partyId === filterContestsByParty)
    ) {
      const tallies: Dictionary<ContestOptionTally> = {}
      if (contest.type === 'yesno') {
        ;[['yes'] as YesNoOption, ['no'] as YesNoOption].forEach(
          (option: YesNoOption) => {
            if (option.length === 1) {
              tallies[option[0]] = { option, tally: 0 }
            }
          }
        )
      }

      if (contest.type === 'candidate') {
        contest.candidates.forEach((candidate) => {
          tallies[candidate.id] = { option: candidate, tally: 0 }
        })
        if (contest.allowWriteIns) {
          tallies[writeInCandidate.id] = { option: writeInCandidate, tally: 0 }
        }
      }

      let numberOfUndervotes = 0
      let numberOfOvervotes = 0
      let numberOfVotes = 0
      votes.forEach((vote) => {
        const selected = vote[contest.id]
        if (!selected) {
          return
        }

        numberOfVotes += 1
        // overvotes & undervotes
        const maxSelectable =
          contest.type === 'yesno' ? 1 : (contest as CandidateContest).seats
        if (selected.length > maxSelectable) {
          numberOfOvervotes += maxSelectable
          return
        }
        if (selected.length < maxSelectable) {
          numberOfUndervotes += maxSelectable - selected.length
        }
        if (selected.length === 0) {
          return
        }

        if (contest.type === 'yesno') {
          const optionId = selected[0] as string
          const optionTally = tallies[optionId]!
          tallies[optionId] = {
            option: optionTally.option,
            tally: optionTally.tally + 1,
          }
        } else {
          ;(selected as CandidateVote).forEach((selectedOption) => {
            const optionTally = tallies[selectedOption.id]!
            tallies[selectedOption.id] = {
              option: optionTally.option,
              tally: optionTally.tally + 1,
            }
          })
        }
      })
      const metadataForContest = {
        undervotes: numberOfUndervotes,
        overvotes: numberOfOvervotes,
        ballots: numberOfVotes,
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

function getVotingMethodForCastVoteRecord(CVR: CastVoteRecord): VotingMethod {
  return Object.values(VotingMethod).includes(CVR._ballotType as VotingMethod)
    ? (CVR._ballotType as VotingMethod)
    : VotingMethod.Unknown
}

function getTallyForCastVoteRecords(
  election: Election,
  castVoteRecords: Set<CastVoteRecord>,
  filterContestsByParty?: string
): Tally {
  const allVotes: VotesDict[] = []
  const ballotCountsByVotingMethod: Dictionary<number> = {}
  Object.values(VotingMethod).forEach(
    (votingMethod) => (ballotCountsByVotingMethod[votingMethod] = 0)
  )
  for (const CVR of castVoteRecords) {
    const vote = buildVoteFromCvr({ election, cvr: CVR })
    const votingMethod = getVotingMethodForCastVoteRecord(CVR)
    ballotCountsByVotingMethod[votingMethod]! += 1
    allVotes.push(vote)
  }

  const overallTally = tallyVotesByContest({
    election,
    votes: allVotes,
    filterContestsByParty,
  })

  return {
    contestTallies: overallTally,
    castVoteRecords,
    numberOfBallotsCounted: allVotes.length,
    ballotCountsByVotingMethod,
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
  const castVoteRecords: Set<CastVoteRecord> = new Set(
    castVoteRecordLists.flat(1)
  )

  const overallTally = getTallyForCastVoteRecords(election, castVoteRecords)

  const cvrFilesByPrecinct: Dictionary<Set<CastVoteRecord>> = {}
  const cvrFilesByScanner: Dictionary<Set<CastVoteRecord>> = {}
  const cvrFilesByParty: Dictionary<Set<CastVoteRecord>> = {}
  const cvrFilesByVotingMethod: Dictionary<Set<CastVoteRecord>> = {}

  election.precincts.forEach((precinct) => {
    cvrFilesByPrecinct[precinct.id] = new Set()
  })
  election.ballotStyles.forEach((bs) => {
    if (bs.partyId !== undefined && !(bs.partyId in cvrFilesByParty)) {
      cvrFilesByParty[bs.partyId] = new Set()
    }
  })
  Object.values(VotingMethod).forEach((votingMethod) => {
    cvrFilesByVotingMethod[votingMethod] = new Set()
  })

  for (const CVR of castVoteRecords) {
    const filesForPrecinct = cvrFilesByPrecinct[CVR._precinctId]!
    filesForPrecinct.add(CVR)

    let filesForScanner = cvrFilesByScanner[CVR._scannerId]
    if (!filesForScanner) {
      cvrFilesByScanner[CVR._scannerId] = filesForScanner = new Set()
    }
    filesForScanner.add(CVR)

    const partyForBallot = getPartyIdForCVR(CVR, election)
    if (partyForBallot !== undefined) {
      const filesForParty = cvrFilesByParty[partyForBallot]!
      filesForParty.add(CVR)
    }
    const ballotTypeForBallot = getVotingMethodForCastVoteRecord(CVR)
    const filesForVotingMethod = cvrFilesByVotingMethod[ballotTypeForBallot]!
    filesForVotingMethod.add(CVR)
  }

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

    if (category === TallyCategory.VotingMethod) {
      const votingMethodTallyResults: Dictionary<Tally> = {}
      for (const votingMethod of Object.values(VotingMethod)) {
        const CVRs = cvrFilesByVotingMethod[votingMethod]!
        votingMethodTallyResults[votingMethod] = getTallyForCastVoteRecords(
          election,
          CVRs
        )
      }
      resultsByCategory.set(category, votingMethodTallyResults)
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
    castVoteRecords: new Set(),
    contestTallies: {},
    ballotCountsByVotingMethod: {},
  }
}

export function filterTalliesByParams(
  fullElectionTally: FullElectionTally,
  election: Election,
  {
    precinctId,
    scannerId,
    partyId,
    votingMethod,
  }: {
    precinctId?: string
    scannerId?: string
    partyId?: string
    votingMethod?: VotingMethod
  }
): Tally {
  const { overallTally, resultsByCategory } = fullElectionTally

  if (!scannerId && !precinctId && !partyId && !votingMethod) {
    return overallTally
  }

  if (scannerId && !precinctId && !partyId && !votingMethod) {
    return (
      resultsByCategory.get(TallyCategory.Scanner)?.[scannerId] ||
      getEmptyTally()
    )
  }

  if (precinctId && !scannerId && !partyId && !votingMethod) {
    return (
      resultsByCategory.get(TallyCategory.Precinct)?.[precinctId] ||
      getEmptyTally()
    )
  }
  if (partyId && !scannerId && !precinctId && !votingMethod) {
    return (
      resultsByCategory.get(TallyCategory.Party)?.[partyId] || getEmptyTally()
    )
  }

  if (votingMethod && !partyId && !scannerId && !precinctId) {
    return (
      resultsByCategory.get(TallyCategory.VotingMethod)?.[votingMethod] ||
      getEmptyTally()
    )
  }
  const cvrFiles: Set<CastVoteRecord> = new Set()
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
  const votingMethodTally = votingMethod
    ? resultsByCategory.get(TallyCategory.VotingMethod)?.[votingMethod] ||
      getEmptyTally()
    : undefined

  const ballotCountsByVotingMethod: Dictionary<number> = {}
  Object.values(VotingMethod).forEach(
    (votingMethod) => (ballotCountsByVotingMethod[votingMethod] = 0)
  )
  for (const CVR of overallTally.castVoteRecords) {
    if (!precinctTally || precinctTally.castVoteRecords.has(CVR)) {
      if (!scannerTally || scannerTally.castVoteRecords.has(CVR)) {
        if (!partyTally || partyTally.castVoteRecords.has(CVR)) {
          if (
            !votingMethodTally ||
            votingMethodTally.castVoteRecords.has(CVR)
          ) {
            const vote = buildVoteFromCvr({ election, cvr: CVR })
            const votingMethod = getVotingMethodForCastVoteRecord(CVR)
            ballotCountsByVotingMethod[votingMethod]! += 1
            cvrFiles.add(CVR)
            allVotes.push(vote)
          }
        }
      }
    }
  }

  const contestTallies = tallyVotesByContest({
    election,
    votes: allVotes,
    filterContestsByParty: partyId,
  })
  return {
    contestTallies,
    castVoteRecords: cvrFiles,
    numberOfBallotsCounted: allVotes.length,
    ballotCountsByVotingMethod,
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
  const ballotStyle = getBallotStyle({
    ballotStyleId: castVoteRecord._ballotStyleId,
    election,
  })
  assert(ballotStyle)
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
