import {
  Dictionary,
  Election,
  getContests,
  ContestTally,
  FullElectionTally,
  TallyCategory,
  FullElectionManualTally,
} from '@votingworks/types';
import {
  ExportableContestTally,
  ExportableTallies,
  ExportableTally,
} from '../config/types';

export function getEmptyExportableTallies(): ExportableTallies {
  return {
    talliesByPrecinct: {},
  };
}

// only exported for testing
export function getCombinedExportableContestTally(
  exportableTally: ExportableContestTally,
  newTally: ContestTally
): ExportableContestTally {
  const combinedOptionsTallies: Dictionary<number> = {};

  // Add in any keys in the exportable tally, combined with tallies, if they exist, from the new tally.
  for (const optionId of Object.keys(exportableTally.tallies)) {
    const currentValue = exportableTally.tallies[optionId] ?? 0;
    const newValue = newTally.tallies[optionId]?.tally ?? 0;
    combinedOptionsTallies[optionId] = currentValue + newValue;
  }

  // Add in any keys from the new tally that don't already exist in the dictionary
  for (const optionId of Object.keys(newTally.tallies)) {
    if (!(optionId in combinedOptionsTallies)) {
      combinedOptionsTallies[optionId] = newTally.tallies[optionId]?.tally ?? 0;
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
  };
}

export function getExportableTallies(
  internalElectionTally: FullElectionTally,
  election: Election,
  manualElectionTally?: FullElectionManualTally
): ExportableTallies {
  const talliesByPrecinct = internalElectionTally.resultsByCategory.get(
    TallyCategory.Precinct
  );
  if (talliesByPrecinct === undefined) {
    return getEmptyExportableTallies();
  }

  const manualTallyByPrecinct = manualElectionTally?.resultsByCategory.get(
    TallyCategory.Precinct
  );

  const exportableTalliesByPrecinct: Dictionary<ExportableTally> = {};
  for (const precinct of election.precincts) {
    const ballotStylesForPrecinct = election.ballotStyles.filter((bs) =>
      bs.precincts.includes(precinct.id)
    );
    const ballotStyleContests = new Set(
      ballotStylesForPrecinct.flatMap((bs) =>
        getContests({ ballotStyle: bs, election })
      )
    );
    const tallyForPrecinct = talliesByPrecinct[precinct.id];
    const manualTallyForPrecinct = manualTallyByPrecinct?.[precinct.id];
    const exportableTallyForPrecinct: ExportableTally = {};
    for (const contest of ballotStyleContests) {
      let exportableContestTally: ExportableContestTally = {
        tallies: {},
        metadata: { ballots: 0, undervotes: 0, overvotes: 0 },
      };
      const contestTalliesToCombine = [
        tallyForPrecinct?.contestTallies[contest.id],
        manualTallyForPrecinct?.contestTallies[contest.id],
      ].filter((t): t is ContestTally => !!t);
      for (const contestTallyToCombine of contestTalliesToCombine) {
        exportableContestTally = getCombinedExportableContestTally(
          exportableContestTally,
          contestTallyToCombine
        );
      }
      exportableTallyForPrecinct[contest.id] = exportableContestTally;
    }
    exportableTalliesByPrecinct[precinct.id] = exportableTallyForPrecinct;
  }
  return {
    talliesByPrecinct: exportableTalliesByPrecinct,
  };
}
