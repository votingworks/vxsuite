import { Dictionary, Election, getContests } from '@votingworks/types'
import {
  ContestTally,
  ExportableContestTally,
  ExportableTallies,
  ExportableTally,
  ExternalTally,
  FullElectionExternalTally,
  FullElectionTally,
  TallyCategory,
} from '../config/types'
import { expandEitherNeitherContests } from './election'

export function getEmptyExportableTallies(): ExportableTallies {
  return {
    talliesByPrecinct: {},
  }
}

// only exported for testing
export function getCombinedExportableContestTally(
  exportableTally: ExportableContestTally,
  newTally: ContestTally
): ExportableContestTally {
  const combinedOptionsTallies: Dictionary<number> = {}

  // Add in any keys in the exportable tally, combined with tallies, if they exist, from the new tally.
  for (const optionId of Object.keys(exportableTally.tallies)) {
    const currentValue = exportableTally.tallies[optionId] ?? 0
    const newValue = newTally.tallies[optionId]?.tally ?? 0
    combinedOptionsTallies[optionId] = currentValue + newValue
  }

  // Add in any keys from the new tally that don't already exist in the dictionary
  for (const optionId of Object.keys(newTally.tallies)) {
    if (!(optionId in combinedOptionsTallies)) {
      combinedOptionsTallies[optionId] = newTally.tallies[optionId]?.tally ?? 0
    }
  }

  return {
    tallies: combinedOptionsTallies,
    metadata: {
      overvotes:
        exportableTally.metadata.overvotes + newTally.metadata.overvotes,
      undervotes:
        exportableTally.metadata.undervotes + newTally.metadata.undervotes,
      ballots: exportableTally.metadata.ballots + newTally.metadata.ballots,
    },
  }
}

export function getExportableTallies(
  internalElectionTally: FullElectionTally,
  externalElectionTallies: FullElectionExternalTally[],
  election: Election
): ExportableTallies {
  const talliesByPrecinct = internalElectionTally.resultsByCategory.get(
    TallyCategory.Precinct
  )
  const externalTalliesByPrecinct = externalElectionTallies
    .map((t) => t.resultsByCategory.get(TallyCategory.Precinct))
    .filter((t): t is Dictionary<ExternalTally> => !!t)

  if (talliesByPrecinct === undefined) {
    return getEmptyExportableTallies()
  }
  const exportableTalliesByPrecinct: Dictionary<ExportableTally> = {}
  for (const precinct of election.precincts) {
    const ballotStylesForPrecinct = election.ballotStyles.filter((bs) =>
      bs.precincts.includes(precinct.id)
    )
    const ballotStyleContests = new Set(
      ballotStylesForPrecinct.flatMap((bs) =>
        expandEitherNeitherContests(getContests({ ballotStyle: bs, election }))
      )
    )
    const tallyForPrecinct = talliesByPrecinct[precinct.id]
    const externalTalliesForPrecinct = externalTalliesByPrecinct
      .map((t) => t[precinct.id])
      .filter((t): t is ExternalTally => !!t)
    const exportableTallyForPrecinct: ExportableTally = {}
    for (const contest of ballotStyleContests) {
      let exportableContestTally: ExportableContestTally = {
        tallies: {},
        metadata: { ballots: 0, undervotes: 0, overvotes: 0 },
      }
      const contestTalliesToCombine = [
        tallyForPrecinct?.contestTallies[contest.id],
        ...externalTalliesForPrecinct.map((t) => t.contestTallies[contest.id]),
      ].filter((t): t is ContestTally => !!t)
      for (const contestTallyToCombine of contestTalliesToCombine) {
        exportableContestTally = getCombinedExportableContestTally(
          exportableContestTally,
          contestTallyToCombine
        )
      }
      exportableTallyForPrecinct[contest.id] = exportableContestTally
    }
    exportableTalliesByPrecinct[precinct.id] = exportableTallyForPrecinct
  }
  return {
    talliesByPrecinct: exportableTalliesByPrecinct,
  }
}
