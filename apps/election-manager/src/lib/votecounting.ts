import {
  Candidate,
  CandidateContest,
  Contest,
  Election,
  Party,
  Vote,
  VotesDict,
  getBallotStyle,
  getContests,
  Dictionary,
  expandEitherNeitherContests,
  Optional,
  Tally,
  ContestTally,
  ContestTallyMetaDictionary,
  FullElectionTally,
  TallyCategory,
  VotingMethod,
  BatchTally,
} from '@votingworks/types'
import {
  buildVoteFromCvr,
  calculateTallyForCastVoteRecords,
  find,
  getVotingMethodForCastVoteRecord,
  tallyVotesByContest,
  throwIllegalValue,
  typedAs,
} from '@votingworks/utils'
import { strict as assert } from 'assert'

import { CastVoteRecord, CastVoteRecordLists } from '../config/types'

import { writeInCandidate } from '../utils/election'

const MISSING_BATCH_ID = 'missing-batch-id'

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
        _batchId,
        _batchLabel,
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
              const contest = find(
                expandEitherNeitherContests(election.contests),
                (c) => c.id === contestId
              )
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
                    break
                  }
                  default:
                    throwIllegalValue(contest)
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

      if (typeof _batchId !== 'string' && typeof _batchId !== 'undefined') {
        errors.push(
          `Batch ID in CVR must be a string, got '${_batchId}' (${typeof _batchId}, not string)`
        )
      }

      if (
        typeof _batchLabel !== 'string' &&
        typeof _batchLabel !== 'undefined'
      ) {
        errors.push(
          `Batch label in CVR must be a string, got '${_batchLabel}' (${typeof _batchLabel}, not string)`
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
    return {
      ...dictionary,
      [contest.id]: {
        ballots: contestCVRs.length,
        overvotes: overvotes.length,
        undervotes: numberOfUndervotes,
      },
    }
  }, {})
}

function getPartyIdForCVR(
  CVR: CastVoteRecord,
  election: Election
): string | undefined {
  return election.ballotStyles.find((bs) => bs.id === CVR._ballotStyleId)
    ?.partyId
}

interface BatchInfo {
  castVoteRecords: Set<CastVoteRecord>
  batchLabels: Set<string>
  scannerIds: Set<string>
}
export function computeFullElectionTally(
  election: Election,
  castVoteRecordLists: CastVoteRecordLists
): FullElectionTally {
  const castVoteRecords: Set<CastVoteRecord> = new Set(
    castVoteRecordLists.flat(1)
  )

  const overallTally = calculateTallyForCastVoteRecords(
    election,
    castVoteRecords
  )

  const cvrFilesByPrecinct: Dictionary<Set<CastVoteRecord>> = {}
  const cvrFilesByScanner: Dictionary<Set<CastVoteRecord>> = {}
  const cvrFilesByParty: Dictionary<Set<CastVoteRecord>> = {}
  const cvrFilesByVotingMethod: Dictionary<Set<CastVoteRecord>> = {}
  const cvrFilesByBatch: Dictionary<BatchInfo> = {}

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
    const filesForPrecinct = cvrFilesByPrecinct[CVR._precinctId]
    assert(filesForPrecinct)
    filesForPrecinct.add(CVR)

    let filesForScanner = cvrFilesByScanner[CVR._scannerId]
    if (!filesForScanner) {
      filesForScanner = new Set()
      cvrFilesByScanner[CVR._scannerId] = filesForScanner
    }
    filesForScanner.add(CVR)

    const partyForBallot = getPartyIdForCVR(CVR, election)
    if (partyForBallot !== undefined) {
      const filesForParty = cvrFilesByParty[partyForBallot]
      assert(filesForParty)
      filesForParty.add(CVR)
    }
    const ballotTypeForBallot = getVotingMethodForCastVoteRecord(CVR)
    const filesForVotingMethod = cvrFilesByVotingMethod[ballotTypeForBallot]
    assert(filesForVotingMethod)
    filesForVotingMethod.add(CVR)

    const batchId = CVR._batchId || MISSING_BATCH_ID
    const batchInfo = cvrFilesByBatch[batchId]
    const filesForBatch =
      batchInfo?.castVoteRecords ?? new Set<CastVoteRecord>()
    const batchLabels = batchInfo?.batchLabels ?? new Set<string>()
    const batchScannerIds = batchInfo?.scannerIds ?? new Set<string>()
    if (!batchInfo) {
      cvrFilesByBatch[batchId] = {
        castVoteRecords: filesForBatch,
        batchLabels,
        scannerIds: batchScannerIds,
      }
    }
    filesForBatch.add(CVR)
    if (CVR._batchLabel) {
      batchLabels.add(CVR._batchLabel)
    }
    batchScannerIds.add(CVR._scannerId)
  }

  const resultsByCategory = new Map<TallyCategory, Dictionary<Tally>>()
  for (const category of Object.values(TallyCategory)) {
    if (category === TallyCategory.Precinct) {
      const precinctTallyResults: Dictionary<Tally> = {}
      for (const precinctId in cvrFilesByPrecinct) {
        if (
          Object.prototype.hasOwnProperty.call(cvrFilesByPrecinct, precinctId)
        ) {
          const CVRs = cvrFilesByPrecinct[precinctId]
          assert(CVRs)
          precinctTallyResults[precinctId] = calculateTallyForCastVoteRecords(
            election,
            CVRs
          )
        }
      }
      resultsByCategory.set(category, precinctTallyResults)
    }

    if (category === TallyCategory.Scanner) {
      const scannerTallyResults: Dictionary<Tally> = {}
      for (const scannerId in cvrFilesByScanner) {
        if (
          Object.prototype.hasOwnProperty.call(cvrFilesByScanner, scannerId)
        ) {
          const CVRs = cvrFilesByScanner[scannerId]
          assert(CVRs)
          scannerTallyResults[scannerId] = calculateTallyForCastVoteRecords(
            election,
            CVRs
          )
        }
      }
      resultsByCategory.set(category, scannerTallyResults)
    }

    if (category === TallyCategory.Party) {
      const partyTallyResults: Dictionary<Tally> = {}
      for (const partyId in cvrFilesByParty) {
        if (Object.prototype.hasOwnProperty.call(cvrFilesByParty, partyId)) {
          const CVRs = cvrFilesByParty[partyId]
          assert(CVRs)
          partyTallyResults[partyId] = calculateTallyForCastVoteRecords(
            election,
            CVRs,
            partyId
          )
        }
      }
      resultsByCategory.set(category, partyTallyResults)
    }

    if (category === TallyCategory.VotingMethod) {
      const votingMethodTallyResults: Dictionary<Tally> = {}
      for (const votingMethod of Object.values(VotingMethod)) {
        const CVRs = cvrFilesByVotingMethod[votingMethod]
        assert(CVRs)
        votingMethodTallyResults[
          votingMethod
        ] = calculateTallyForCastVoteRecords(election, CVRs)
      }
      resultsByCategory.set(category, votingMethodTallyResults)
    }

    if (category === TallyCategory.Batch) {
      const batchTallyResults: Dictionary<Tally> = {}
      for (const batchId in cvrFilesByBatch) {
        if (Object.prototype.hasOwnProperty.call(cvrFilesByBatch, batchId)) {
          const batchInfo = cvrFilesByBatch[batchId]
          assert(batchInfo)
          const batchLabels = [...batchInfo.batchLabels]
          const batchLabel =
            batchLabels.length > 0 ? batchLabels[0] : 'Missing Batch'
          batchTallyResults[batchId] = typedAs<BatchTally>({
            ...calculateTallyForCastVoteRecords(
              election,
              batchInfo.castVoteRecords
            ),
            batchLabel,
            scannerIds: [...batchInfo.scannerIds],
          })
        }
      }
      resultsByCategory.set(category, batchTallyResults)
    }
  }

  return {
    overallTally,
    resultsByCategory,
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

export function getEmptyFullElectionTally(): FullElectionTally {
  return {
    overallTally: getEmptyTally(),
    resultsByCategory: new Map(),
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
    batchId,
  }: {
    precinctId?: string
    scannerId?: string
    partyId?: string
    votingMethod?: VotingMethod
    batchId?: string
  }
): Tally {
  const { overallTally, resultsByCategory } = fullElectionTally

  if (!scannerId && !precinctId && !partyId && !votingMethod && !batchId) {
    return overallTally
  }

  if (scannerId && !precinctId && !partyId && !votingMethod && !batchId) {
    return (
      resultsByCategory.get(TallyCategory.Scanner)?.[scannerId] ||
      getEmptyTally()
    )
  }

  if (batchId && !precinctId && !partyId && !votingMethod && !scannerId) {
    return (
      resultsByCategory.get(TallyCategory.Batch)?.[batchId] || getEmptyTally()
    )
  }

  if (precinctId && !scannerId && !partyId && !votingMethod && !batchId) {
    return (
      resultsByCategory.get(TallyCategory.Precinct)?.[precinctId] ||
      getEmptyTally()
    )
  }
  if (partyId && !scannerId && !precinctId && !votingMethod && !batchId) {
    return (
      resultsByCategory.get(TallyCategory.Party)?.[partyId] || getEmptyTally()
    )
  }

  if (votingMethod && !partyId && !scannerId && !precinctId && !batchId) {
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
  const batchTally = batchId
    ? resultsByCategory.get(TallyCategory.Batch)?.[batchId] || getEmptyTally()
    : undefined

  const ballotCountsByVotingMethod: Dictionary<number> = {}
  Object.values(VotingMethod).forEach((method) => {
    ballotCountsByVotingMethod[method] = 0
  })
  for (const CVR of overallTally.castVoteRecords) {
    if (!precinctTally || precinctTally.castVoteRecords.has(CVR)) {
      if (!scannerTally || scannerTally.castVoteRecords.has(CVR)) {
        if (!batchTally || batchTally.castVoteRecords.has(CVR)) {
          if (!partyTally || partyTally.castVoteRecords.has(CVR)) {
            if (
              !votingMethodTally ||
              votingMethodTally.castVoteRecords.has(CVR)
            ) {
              const vote = buildVoteFromCvr({ election, cvr: CVR })
              const votingMethodForCVR = getVotingMethodForCastVoteRecord(CVR)
              const count = ballotCountsByVotingMethod[votingMethodForCVR] ?? 0
              ballotCountsByVotingMethod[votingMethodForCVR] = count + 1
              cvrFiles.add(CVR)
              allVotes.push(vote)
            }
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

export function filterTalliesByParamsAndBatchId(
  fullElectionTally: FullElectionTally,
  election: Election,
  batchId: string,
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
): BatchTally {
  const { resultsByCategory } = fullElectionTally
  const batchTally = resultsByCategory.get(TallyCategory.Batch)?.[
    batchId
  ] as Optional<BatchTally>
  const filteredTally = filterTalliesByParams(fullElectionTally, election, {
    precinctId,
    scannerId,
    partyId,
    votingMethod,
    batchId,
  })
  return typedAs<BatchTally>({
    ...filteredTally,
    batchLabel: batchTally?.batchLabel || '',
    scannerIds: batchTally?.scannerIds || [],
  })
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
  for (let i = 0; i < inputArray.length; i += 1) {
    for (let j = i + 1; j < inputArray.length; j += 1) {
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
    _batchId: castVoteRecord._batchId,
    _batchLabel: castVoteRecord._batchLabel,
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
    if (!safeCVR) continue

    for (const contestId in safeCVR) {
      if (Object.prototype.hasOwnProperty.call(safeCVR, contestId)) {
        const contestOvervotePairTallies = overvotePairTallies[contestId]
        if (!contestOvervotePairTallies) continue

        const candidateContest = contestOvervotePairTallies.contest as CandidateContest
        const selected = safeCVR[contestId] as string[]

        if (!selected || selected.length <= candidateContest.seats) continue

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
  }

  return overvotePairTallies
}
