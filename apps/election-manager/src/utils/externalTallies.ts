import { Dictionary, Election, getContests } from '@votingworks/types'

import { strict as assert } from 'assert'
import {
  ContestOptionTally,
  ContestTally,
  ExternalTally,
  ExternalTallySourceType,
  FullElectionExternalTally,
  OptionalExternalTally,
  OptionalFullElectionExternalTally,
  TallyCategory,
  VotingMethod,
} from '../config/types'
import {
  expandEitherNeitherContests,
  getDistrictIdsForPartyId,
  getPartiesWithPrimaryElections,
  writeInCandidate,
} from './election'

export function convertExternalTalliesToStorageString(
  tallies: FullElectionExternalTally[]
): string {
  return JSON.stringify(
    tallies.map((tally) => {
      return {
        ...tally,
        resultsByCategory: Array.from(tally.resultsByCategory.entries()),
        timestampCreated: tally.timestampCreated.getTime(),
      }
    })
  )
}

export function convertStorageStringToExternalTallies(
  inputString: string
): FullElectionExternalTally[] {
  const parsedJSON = JSON.parse(inputString) as Record<string, unknown>[]
  return parsedJSON.map((data) => {
    const {
      overallTally,
      resultsByCategory,
      votingMethod,
      source,
      inputSourceName,
      timestampCreated,
    } = data
    return {
      overallTally,
      votingMethod,
      source,
      inputSourceName,
      resultsByCategory: new Map(
        resultsByCategory as readonly (readonly [unknown, unknown])[]
      ),
      timestampCreated: new Date(timestampCreated as number),
    } as FullElectionExternalTally
  })
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

export function getEmptyExternalTally(): ExternalTally {
  return {
    contestTallies: {},
    numberOfBallotsCounted: 0,
  }
}

export function getPrecinctIdsInExternalTally(
  tally: FullElectionExternalTally
): string[] {
  const resultsByPrecinct = tally.resultsByCategory.get(TallyCategory.Precinct)
  if (resultsByPrecinct) {
    const precinctsWithBallots: string[] = []
    for (const precinctId of Object.keys(resultsByPrecinct)) {
      if ((resultsByPrecinct[precinctId]?.numberOfBallotsCounted ?? 0) > 0) {
        precinctsWithBallots.push(precinctId)
      }
    }
    return precinctsWithBallots
  }
  return []
}

export function filterExternalTalliesByParams(
  fullTally: OptionalFullElectionExternalTally,
  election: Election,
  {
    precinctId,
    partyId,
    scannerId,
    votingMethod,
  }: {
    precinctId?: string
    partyId?: string
    scannerId?: string
    votingMethod?: VotingMethod
  }
): OptionalExternalTally {
  if (!fullTally || scannerId) {
    return undefined
  }

  if (votingMethod && fullTally.votingMethod !== votingMethod) {
    return getEmptyExternalTally()
  }

  const { overallTally, resultsByCategory } = fullTally

  let filteredTally = overallTally

  if (precinctId) {
    filteredTally =
      resultsByCategory.get(TallyCategory.Precinct)?.[precinctId] ||
      getEmptyExternalTally()
  }

  if (!partyId) {
    return filteredTally
  }

  return filterTallyForPartyId(filteredTally, partyId, election)
}

function filterTallyForPartyId(
  tally: ExternalTally,
  partyId: string,
  election: Election
) {
  // Filter contests by party and recompute the number of ballots based on those contests.
  const districtsForParty = getDistrictIdsForPartyId(election, partyId)
  const filteredContestTallies: Dictionary<ContestTally> = {}
  Object.keys(tally.contestTallies).forEach((contestId) => {
    const contestTally = tally.contestTallies[contestId]
    if (
      contestTally &&
      districtsForParty.includes(contestTally.contest.districtId) &&
      contestTally.contest.partyId === partyId
    ) {
      filteredContestTallies[contestId] = contestTally
    }
  })
  const numberOfBallotsCounted = getTotalNumberOfBallots(
    filteredContestTallies,
    election
  )
  return {
    contestTallies: filteredContestTallies,
    numberOfBallotsCounted,
  }
}

export function convertTalliesByPrecinctToFullExternalTally(
  talliesByPrecinct: Dictionary<ExternalTally>,
  election: Election,
  votingMethod: VotingMethod,
  source: ExternalTallySourceType,
  inputSourceName: string,
  timestampCreated: Date
): FullElectionExternalTally {
  let totalNumberOfBallots = 0
  const overallContestTallies: Dictionary<ContestTally> = {}
  for (const precinctTally of Object.values(talliesByPrecinct)) {
    totalNumberOfBallots += precinctTally!.numberOfBallotsCounted
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

  const overallTally: ExternalTally = {
    contestTallies: overallContestTallies,
    numberOfBallotsCounted: totalNumberOfBallots,
  }

  const resultsByCategory = new Map()
  resultsByCategory.set(TallyCategory.Precinct, talliesByPrecinct)

  // Compute results filtered by party, this filters the sets of contests and requires recomputing the number of ballots counted.
  const contestTalliesByParty: Dictionary<ExternalTally> = {}
  const partiesInElection = getPartiesWithPrimaryElections(election)
  partiesInElection.forEach((party) => {
    contestTalliesByParty[party.id] = filterTallyForPartyId(
      overallTally,
      party.id,
      election
    )
  })
  resultsByCategory.set(TallyCategory.Party, contestTalliesByParty)

  return {
    overallTally,
    resultsByCategory,
    votingMethod,
    inputSourceName,
    source,
    timestampCreated,
  }
}

const getEmptyContestTallies = (
  election: Election
): Dictionary<ContestTally> => {
  const contestTallies: Dictionary<ContestTally> = {}
  for (const contest of expandEitherNeitherContests(election.contests)) {
    const optionTallies: Dictionary<ContestOptionTally> = {}
    switch (contest.type) {
      case 'candidate': {
        for (const candidate of contest.candidates) {
          optionTallies[candidate.id] = {
            option: candidate,
            tally: 0,
          }
        }
        if (contest.allowWriteIns) {
          optionTallies[writeInCandidate.id] = {
            option: writeInCandidate,
            tally: 0,
          }
        }
        break
      }
      case 'yesno': {
        optionTallies.yes = {
          option: ['yes'],
          tally: 0,
        }
        optionTallies.no = {
          option: ['no'],
          tally: 0,
        }
        break
      }
    }
    contestTallies[contest.id] = {
      contest,
      tallies: optionTallies,
      metadata: { overvotes: 0, undervotes: 0, ballots: 0 },
    }
  }
  return contestTallies
}

export const getEmptyExternalTalliesByPrecinct = (
  election: Election
): Dictionary<ExternalTally> => {
  const tallies: Dictionary<ExternalTally> = {}
  for (const precinct of election.precincts) {
    tallies[precinct.id] = {
      contestTallies: getEmptyContestTallies(election),
      numberOfBallotsCounted: 0,
    }
  }
  return tallies
}
