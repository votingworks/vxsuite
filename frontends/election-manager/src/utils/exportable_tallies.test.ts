import {
  electionMultiPartyPrimaryFixtures,
  electionWithMsEitherNeitherFixtures,
} from '@votingworks/fixtures';
import {
  CandidateContest,
  CastVoteRecord,
  ContestTally,
  Election,
  VotingMethod,
  writeInCandidate,
  YesNoContest,
} from '@votingworks/types';
import { ExportableContestTally, ExportableTallies } from '../config/types';
import { computeFullElectionTally, parseCvrs } from '../lib/votecounting';
import {
  getCombinedExportableContestTally,
  getExportableTallies,
} from './exportable_tallies';
import { convertSemsFileToExternalTally } from './sems_tallies';

const multiPartyPrimaryElection =
  electionMultiPartyPrimaryFixtures.electionDefinition.election;
const electionWithMsEitherNeither =
  electionWithMsEitherNeitherFixtures.electionDefinition.election;

const yesnocontest = electionWithMsEitherNeither.contests.find(
  (c) => c.id === '750000017'
) as YesNoContest;
const presidentcontest = electionWithMsEitherNeither.contests.find(
  (c) => c.id === '775020876'
) as CandidateContest;

function parseCvrsAndAssertSuccess(
  cvrsFileContents: string,
  election: Election
): CastVoteRecord[] {
  return [...parseCvrs(cvrsFileContents, election)].map(({ cvr, errors }) => {
    expect({ cvr, errors }).toEqual({ cvr, errors: [] });
    return cvr;
  });
}

function assertTalliesAreIdenticalMultiples(
  baseTally: ExportableTallies,
  multipleTally: ExportableTallies,
  multiplier: number
): void {
  // Both tallies should have the same precincts defined
  expect(Object.keys(baseTally.talliesByPrecinct)).toEqual(
    Object.keys(multipleTally.talliesByPrecinct)
  );
  for (const precinctId of Object.keys(baseTally.talliesByPrecinct)) {
    expect(precinctId in multipleTally.talliesByPrecinct).toBeTruthy();
    const baseForPrecinct = baseTally.talliesByPrecinct[precinctId];
    const multipleForPrecinct = multipleTally.talliesByPrecinct[precinctId];
    // Both tallies should have the same contests defined
    expect(Object.keys(baseForPrecinct!)).toEqual(
      Object.keys(multipleForPrecinct!)
    );
    for (const contestId of Object.keys(baseForPrecinct!)) {
      expect(contestId in multipleForPrecinct!).toBeTruthy();
      const baseContestTally = baseForPrecinct![contestId]!;
      const multipleContestTally = multipleForPrecinct![contestId]!;
      // Metadata should be multiplied
      expect(multipleContestTally.metadata).toEqual({
        ballots: baseContestTally.metadata.ballots * multiplier,
        overvotes: baseContestTally.metadata.overvotes * multiplier,
        undervotes: baseContestTally.metadata.undervotes * multiplier,
      });

      // Both tallies should have the same candidates defined
      expect(Object.keys(baseContestTally.tallies)).toEqual(
        Object.keys(multipleContestTally.tallies)
      );

      for (const optionId of Object.keys(baseContestTally.tallies)) {
        // Candidate/yes/no tallies should be multiplied
        expect(multipleContestTally.tallies[optionId]!).toEqual(
          multiplier * baseContestTally.tallies[optionId]!
        );
      }
    }
  }
}

describe('getCombinedExportableContestTally', () => {
  it('combines yes no contests as expected', () => {
    const emptyExportable: ExportableContestTally = {
      tallies: {},
      metadata: { ballots: 0, undervotes: 0, overvotes: 0 },
    };
    const emptyContestTally: ContestTally = {
      contest: yesnocontest,
      tallies: {
        yes: { option: ['yes'], tally: 0 },
        no: { option: ['no'], tally: 0 },
      },
      metadata: { ballots: 0, undervotes: 0, overvotes: 0 },
    };
    expect(
      getCombinedExportableContestTally(emptyExportable, emptyContestTally)
    ).toEqual({
      tallies: {
        yes: 0,
        no: 0,
      },
      metadata: { ballots: 0, undervotes: 0, overvotes: 0 },
    });

    const populatedContestTally: ContestTally = {
      contest: yesnocontest,
      tallies: {
        yes: { option: ['yes'], tally: 3 },
        no: { option: ['no'], tally: 4 },
      },
      metadata: { ballots: 18, undervotes: 5, overvotes: 6 },
    };
    const results = getCombinedExportableContestTally(
      emptyExportable,
      populatedContestTally
    );
    expect(results).toEqual({
      tallies: {
        yes: 3,
        no: 4,
      },
      metadata: { ballots: 18, undervotes: 5, overvotes: 6 },
    });
    expect(
      getCombinedExportableContestTally(results, populatedContestTally)
    ).toEqual({
      tallies: {
        yes: 6,
        no: 8,
      },
      metadata: { ballots: 36, undervotes: 10, overvotes: 12 },
    });
  });

  it('combines candidate contests as expected', () => {
    const emptyExportable: ExportableContestTally = {
      tallies: {},
      metadata: { ballots: 0, undervotes: 0, overvotes: 0 },
    };
    const emptyContestTally: ContestTally = {
      contest: presidentcontest,
      tallies: {
        775031988: {
          option: presidentcontest.candidates.find(
            (c) => c.id === '775031988'
          )!,
          tally: 0,
        },
        775031989: {
          option: presidentcontest.candidates.find(
            (c) => c.id === '775031989'
          )!,
          tally: 0,
        },
      },
      metadata: { ballots: 0, undervotes: 0, overvotes: 0 },
    };

    expect(
      getCombinedExportableContestTally(emptyExportable, emptyContestTally)
    ).toEqual({
      tallies: {
        '775031988': 0,
        '775031989': 0,
      },
      metadata: { ballots: 0, undervotes: 0, overvotes: 0 },
    });

    const partialContestTally: ContestTally = {
      contest: presidentcontest,
      tallies: {
        775031988: {
          option: presidentcontest.candidates.find(
            (c) => c.id === '775031988'
          )!,
          tally: 12,
        },
        775031989: {
          option: presidentcontest.candidates.find(
            (c) => c.id === '775031989'
          )!,
          tally: 8,
        },
      },
      metadata: { ballots: 30, undervotes: 6, overvotes: 4 },
    };
    const partialResult = getCombinedExportableContestTally(
      emptyExportable,
      partialContestTally
    );
    expect(partialResult).toEqual({
      tallies: {
        775031988: 12,
        775031989: 8,
      },
      metadata: { ballots: 30, undervotes: 6, overvotes: 4 },
    });

    const tallyForEveryone: ContestTally = {
      contest: presidentcontest,
      tallies: {
        775031988: {
          option: presidentcontest.candidates.find(
            (c) => c.id === '775031988'
          )!,
          tally: 8,
        },
        775031989: {
          option: presidentcontest.candidates.find(
            (c) => c.id === '775031989'
          )!,
          tally: 12,
        },
        775031987: {
          option: presidentcontest.candidates.find(
            (c) => c.id === '775031987'
          )!,
          tally: 10,
        },
        'write-in': {
          option: writeInCandidate,
          tally: 10,
        },
      },
      metadata: { ballots: 40, undervotes: 4, overvotes: 6 },
    };

    expect(
      getCombinedExportableContestTally(partialResult, tallyForEveryone)
    ).toEqual({
      tallies: {
        775031988: 20,
        775031989: 20,
        775031987: 10,
        'write-in': 10,
      },
      metadata: { ballots: 70, undervotes: 10, overvotes: 10 },
    });
  });
});

describe('getExportableTallies', () => {
  it('builds expected tally object for election with either neither with just internal data', () => {
    const castVoteRecords = parseCvrsAndAssertSuccess(
      electionWithMsEitherNeitherFixtures.cvrData,
      electionWithMsEitherNeither
    );
    const fullInternalTally = computeFullElectionTally(
      electionWithMsEitherNeither,
      new Set(castVoteRecords)
    );
    const tally = getExportableTallies(
      fullInternalTally,
      new Map(),
      electionWithMsEitherNeither
    );
    expect(tally).toMatchSnapshot();
  });

  it('builds expected tally object for election with either neither with external and internal data', () => {
    const castVoteRecords = parseCvrsAndAssertSuccess(
      electionWithMsEitherNeitherFixtures.cvrData,
      electionWithMsEitherNeither
    );
    const fullInternalTally = computeFullElectionTally(
      electionWithMsEitherNeither,
      new Set(castVoteRecords)
    );
    const fullExternalTally = convertSemsFileToExternalTally(
      electionWithMsEitherNeitherFixtures.semsData,
      electionWithMsEitherNeither,
      VotingMethod.Precinct,
      'file-name',
      new Date()
    );
    // Get tally with just CVR data
    const baseTally = getExportableTallies(
      fullInternalTally,
      new Map(),
      electionWithMsEitherNeither
    );
    // Get tally with CVR and SEMS data
    const doubleTally = getExportableTallies(
      fullInternalTally,
      new Map([[fullExternalTally.source, fullExternalTally]]),
      electionWithMsEitherNeither
    );

    // doubleTally should be exactly 2 times everything in baseTally
    assertTalliesAreIdenticalMultiples(baseTally, doubleTally, 2);
  });

  it('builds expected tally object for primary election with just internal data', () => {
    const castVoteRecords = parseCvrsAndAssertSuccess(
      electionMultiPartyPrimaryFixtures.cvrData,
      multiPartyPrimaryElection
    );
    const fullInternalTally = computeFullElectionTally(
      multiPartyPrimaryElection,
      new Set(castVoteRecords)
    );
    const tally = getExportableTallies(
      fullInternalTally,
      new Map(),
      multiPartyPrimaryElection
    );
    expect(tally).toMatchSnapshot();
  });

  it('builds expected tally object for primary election with external and internal data', () => {
    const castVoteRecords = parseCvrsAndAssertSuccess(
      electionMultiPartyPrimaryFixtures.cvrData,
      multiPartyPrimaryElection
    );
    const fullInternalTally = computeFullElectionTally(
      multiPartyPrimaryElection,
      new Set(castVoteRecords)
    );
    const fullExternalTally = convertSemsFileToExternalTally(
      electionMultiPartyPrimaryFixtures.semsData,
      multiPartyPrimaryElection,
      VotingMethod.Precinct,
      'file-name',
      new Date()
    );
    // Get tally with just CVR data
    const baseTally = getExportableTallies(
      fullInternalTally,
      new Map(),
      multiPartyPrimaryElection
    );
    // Get tally with CVR and SEMS data
    const doubleTally = getExportableTallies(
      fullInternalTally,
      new Map([[fullExternalTally.source, fullExternalTally]]),
      multiPartyPrimaryElection
    );

    // doubleTally should be exactly 2 times everything in baseTally
    assertTalliesAreIdenticalMultiples(baseTally, doubleTally, 2);
  });
});
