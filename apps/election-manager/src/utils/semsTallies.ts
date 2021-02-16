import _ from 'lodash'

import {
  Candidate,
  CandidateContest,
  Contest,
  Dictionary,
  Election,
  YesNoContest,
} from '@votingworks/types'

import {
  ContestOptionTally,
  ContestTally,
  ExternalTally,
  FullElectionExternalTally,
  TallyCategory,
  YesNoOption,
} from '../config/types'
import assert from './assert'
import { expandEitherNeitherContests, getContests } from './election'

const WriteInCandidateId = '0'
const OvervoteCandidateId = '1'
const UndervoteCandidateId = '2'

const writeInCandidate: Candidate = {
  id: '__write-in',
  name: 'Write-In',
  isWriteIn: true,
}

export interface SEMSFileRow {
  countyId: string
  precinctId: string
  contestId: string
  contestTitle: string
  partyId: string
  partyName: string
  candidateId: string
  candidateName: string
  candidatePartyId: string
  candidatePartyName: string
  numberOfVotes: number
}

// TODO(caro) revisit how to count the total number of ballots for multi seat contests
// The number of total ballots is undervotes + overvotes + (othervotes / numseats)
// That formula assumes all votes voted for the maxiumum number of seats allowed which is
// probably not true in practice. This is irreleveant with the number of seats is 1.
export function getContestTallyForCandidateContest(
  contest: CandidateContest,
  rows: SEMSFileRow[]
): ContestTally {
  const tallies: Dictionary<ContestOptionTally> = {}
  let undervotes = 0
  let overvotes = 0
  let numCandidateVotes = 0
  let writeInVotes = 0
  const validCandidates = _.keyBy(contest.candidates, 'id')
  for (const row of rows) {
    if (row.candidateId === UndervoteCandidateId) {
      undervotes = row.numberOfVotes
    } else if (row.candidateId === OvervoteCandidateId) {
      overvotes = row.numberOfVotes
    } else if (
      contest.allowWriteIns &&
      row.candidateId === WriteInCandidateId
    ) {
      writeInVotes += row.numberOfVotes
      numCandidateVotes += row.numberOfVotes
    } else if (row.candidateId in validCandidates) {
      const candidate = validCandidates[row.candidateId]
      let previousVoteCounts = 0
      if (candidate.id in tallies) {
        previousVoteCounts = tallies[candidate.id]!.tally
      }
      tallies[candidate.id] = {
        option: candidate,
        tally: row.numberOfVotes + previousVoteCounts,
      }
      numCandidateVotes += row.numberOfVotes
    } else {
      throw new Error(
        `Imported file has unexpected candidate id ${row.candidateId} for contest ${contest.id}`
      )
    }
  }

  if (contest.allowWriteIns) {
    tallies[writeInCandidate.id] = {
      option: writeInCandidate,
      tally: writeInVotes,
    }
  }

  return {
    contest,
    tallies,
    metadata: {
      overvotes,
      undervotes,
      ballots: numCandidateVotes / contest.seats + overvotes + undervotes,
    },
  }
}

export function getContestTallyForYesNoContest(
  contest: YesNoContest,
  rows: SEMSFileRow[]
): ContestTally {
  const tallies: Dictionary<ContestOptionTally> = {}
  let undervotes = 0
  let overvotes = 0
  let numVotes = 0
  for (const row of rows) {
    if (row.candidateId === UndervoteCandidateId) {
      undervotes = row.numberOfVotes
      numVotes += row.numberOfVotes
    } else if (row.candidateId === OvervoteCandidateId) {
      overvotes = row.numberOfVotes
      numVotes += row.numberOfVotes
    } else if (contest.yesOption && row.candidateId === contest.yesOption.id) {
      const previousVoteCounts = 'yes' in tallies ? tallies.yes!.tally : 0
      tallies.yes = {
        option: ['yes'] as YesNoOption,
        tally: row.numberOfVotes + previousVoteCounts,
      }
      numVotes += row.numberOfVotes
    } else if (contest.noOption && row.candidateId === contest.noOption.id) {
      const previousVoteCounts = 'no' in tallies ? tallies.no!.tally : 0
      tallies.no = {
        option: ['no'] as YesNoOption,
        tally: row.numberOfVotes + previousVoteCounts,
      }
      numVotes += row.numberOfVotes
    } else {
      throw new Error(
        `Imported file has unexpected option id ${row.candidateId} for contest ${contest.id}`
      )
    }
  }

  return {
    contest,
    tallies,
    metadata: {
      overvotes,
      undervotes,
      ballots: numVotes,
    },
  }
}

export function combineContestTallies(
  firstTally: ContestTally,
  secondTally: ContestTally
): ContestTally {
  assert(firstTally.contest.id === secondTally.contest.id)
  const combinedTallies: Dictionary<ContestOptionTally> = {}

  for (const optionId of Object.keys(firstTally.tallies)) {
    const firstTallyOption = firstTally.tallies[optionId]!
    const secondTallyOption = secondTally.tallies[optionId]
    combinedTallies[optionId] = {
      option: firstTallyOption.option,
      tally: firstTallyOption.tally + (secondTallyOption?.tally || 0),
    }
  }

  return {
    contest: firstTally.contest,
    tallies: combinedTallies,
    metadata: {
      overvotes: firstTally.metadata.overvotes + secondTally.metadata.overvotes,
      undervotes:
        firstTally.metadata.undervotes + secondTally.metadata.undervotes,
      ballots: firstTally.metadata.ballots + secondTally.metadata.ballots,
    },
  }
}

export function getTotalNumberOfBallots(
  contestTallies: Dictionary<ContestTally>,
  election: Election
): number {
  // Get Separate Ballot Style Sets
  // Get Contest IDs by Ballot Style
  let contestIdSets = election.ballotStyles.map((bs) => {
    return new Set(
      getContests({
        ballotStyle: bs,
        election,
      }).map((c) => c.id)
    )
  })

  // Break the sets of contest IDs into disjoint sets, so contests that are never seen on the same ballot style.
  for (const contest of election.contests) {
    const combinedSetForContest = new Set<string>()
    const newListOfContestIdSets: Set<string>[] = []
    for (const contestIdSet of contestIdSets) {
      if (contestIdSet.has(contest.id)) {
        contestIdSet.forEach((id) => combinedSetForContest.add(id))
      } else {
        newListOfContestIdSets.push(contestIdSet)
      }
    }
    newListOfContestIdSets.push(combinedSetForContest)
    contestIdSets = newListOfContestIdSets
  }

  // Within each ballot set find the maximum number of ballots cast on a contest, that is the number of ballots cast amoungst ballot styles represented.
  const ballotsCastPerSet = contestIdSets.map((set) =>
    [...set].reduce(
      (prevValue, contestId) =>
        Math.max(prevValue, contestTallies[contestId]?.metadata.ballots || 0),
      0
    )
  )

  // Sum across disjoint sets of ballot styles to get the total number of ballots cast.
  return ballotsCastPerSet.reduce(
    (prevValue, maxBallotCount) => prevValue + maxBallotCount,
    0
  )
}

function sanitizeItem(item: string): string {
  return item.replace(/['"`]/g, '').trim()
}

export function convertSEMsFileToExternalTally(
  fileContent: string,
  election: Election
): FullElectionExternalTally {
  const parsedRows: SEMSFileRow[] = []
  fileContent.split('\n').forEach((row) => {
    const entries = row.split(',').map((e) => sanitizeItem(e))
    if (entries.length >= 11) {
      parsedRows.push({
        countyId: entries[0],
        precinctId: entries[1],
        contestId: entries[2],
        contestTitle: entries[3],
        partyId: entries[4],
        partyName: entries[5],
        candidateId: entries[6],
        candidateName: entries[7],
        candidatePartyId: entries[8],
        candidatePartyName: entries[9],
        numberOfVotes: parseInt(entries[10], 10),
      })
    }
  })

  const contestsById: Dictionary<Contest> = {}
  for (const contest of expandEitherNeitherContests(election.contests)) {
    contestsById[contest.id] = contest
  }

  const contestTalliesByPrecinct: Dictionary<ExternalTally> = {}
  const parsedRowsByPrecinct = _.groupBy(parsedRows, 'precinctId')

  for (const precinctId in parsedRowsByPrecinct) {
    if (!election.precincts.find((p) => p.id === precinctId)) {
      throw new Error(`Imported file has unexpected PrecinctId: ${precinctId}`)
    }
    const rowsForPrecinct = parsedRowsByPrecinct[precinctId]

    const contestTallies: Dictionary<ContestTally> = {}
    const rowsForPrecinctAndContest = _.groupBy(rowsForPrecinct, 'contestId')
    for (const contestId in rowsForPrecinctAndContest) {
      if (!(contestId in contestsById)) {
        throw new Error(`Imported file has unexpected PrecinctId: ${contestId}`)
      }
      const electionContest = contestsById[contestId]!

      if (electionContest.type === 'candidate') {
        const contestTally = getContestTallyForCandidateContest(
          electionContest as CandidateContest,
          rowsForPrecinctAndContest[contestId]
        )
        contestTallies[contestId] = contestTally
      } else if (electionContest.type === 'yesno') {
        const contestTally = getContestTallyForYesNoContest(
          electionContest as YesNoContest,
          rowsForPrecinctAndContest[contestId]
        )
        contestTallies[contestId] = contestTally
      }
    }
    contestTalliesByPrecinct[precinctId] = {
      contestTallies,
      numberOfBallotsCounted: getTotalNumberOfBallots(contestTallies, election),
    }
  }

  const overallContestTallies: Dictionary<ContestTally> = {}
  for (const precinctTally of Object.values(contestTalliesByPrecinct)) {
    for (const contestId of Object.keys(precinctTally!.contestTallies)) {
      if (!(contestId in overallContestTallies)) {
        overallContestTallies[contestId] = precinctTally!.contestTallies[
          contestId
        ]
      } else {
        const existingContestTallies = overallContestTallies[contestId]!
        overallContestTallies[contestId] = combineContestTallies(
          existingContestTallies,
          precinctTally!.contestTallies[contestId]!
        )
      }
    }
  }

  const resultsByCategory = new Map()
  resultsByCategory.set(TallyCategory.Precinct, contestTalliesByPrecinct)
  return {
    overallTally: {
      contestTallies: overallContestTallies,
      numberOfBallotsCounted: getTotalNumberOfBallots(
        overallContestTallies,
        election
      ),
    },
    resultsByCategory,
  }
}

export function getPrecinctIdsInExternalTally(
  tally: FullElectionExternalTally
): string[] {
  const resultsByPrecinct = tally.resultsByCategory.get(TallyCategory.Precinct)
  return resultsByPrecinct ? Object.keys(resultsByPrecinct) : []
}
