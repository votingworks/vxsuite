import { typedAs } from '@votingworks/basics';
import {
  electionSample,
  multiPartyPrimaryElection,
  electionWithMsEitherNeither,
} from '@votingworks/fixtures';
import {
  CandidateContest,
  Dictionary,
  YesNoContest,
  ContestTally,
  ManualTally,
  FullElectionManualTally,
  TallyCategory,
  VotingMethod,
  unsafeParse,
  PartyIdSchema,
} from '@votingworks/types';
import { combineContestTallies } from '@votingworks/utils';
import { buildManualTally } from '../../test/helpers/build_manual_tally';
import { buildCandidateTallies } from '../../test/util/build_candidate_tallies';

import {
  convertManualTallyToStorageString,
  convertStorageStringToManualTally,
  convertTalliesByPrecinctToFullManualTally,
  filterManualTalliesByParams,
  getEmptyManualTalliesByPrecinct,
  getEmptyManualTally,
  getPrecinctIdsInManualTally,
  getTotalNumberOfBallots,
} from './manual_tallies';

const yesnocontest = electionSample.contests.find(
  (c) => c.id === 'question-a'
) as YesNoContest;
const presidentcontest = electionSample.contests.find(
  (c) => c.id === 'president'
) as CandidateContest;

describe('combineContestTallies', () => {
  it('combine yes no tallies with an empty tally', () => {
    const tally1: ContestTally = {
      contest: yesnocontest,
      tallies: {
        yes: { option: ['yes'], tally: 12 },
        no: { option: ['no'], tally: 32 },
      },
      metadata: { overvotes: 3, undervotes: 2, ballots: 49 },
    };
    const tally2: ContestTally = {
      contest: yesnocontest,
      tallies: {
        yes: { option: ['yes'], tally: 0 },
        no: { option: ['no'], tally: 0 },
      },
      metadata: { overvotes: 0, undervotes: 0, ballots: 0 },
    };
    expect(combineContestTallies(tally1, tally2)).toStrictEqual(tally1);
  });

  it('combine yes no tallies properly', () => {
    const tally1: ContestTally = {
      contest: yesnocontest,
      tallies: {
        yes: { option: ['yes'], tally: 12 },
        no: { option: ['no'], tally: 32 },
      },
      metadata: { overvotes: 3, undervotes: 2, ballots: 49 },
    };
    const tally2: ContestTally = {
      contest: yesnocontest,
      tallies: {
        yes: { option: ['yes'], tally: 26 },
        no: { option: ['no'], tally: 32 },
      },
      metadata: { overvotes: 1, undervotes: 4, ballots: 63 },
    };
    expect(combineContestTallies(tally1, tally2)).toStrictEqual(
      typedAs<ContestTally>({
        contest: yesnocontest,
        tallies: {
          yes: { option: ['yes'], tally: 38 },
          no: { option: ['no'], tally: 64 },
        },
        metadata: { overvotes: 4, undervotes: 6, ballots: 112 },
      })
    );
  });

  it('combines candidate tally with empty tally properly', () => {
    const tally1: ContestTally = {
      contest: presidentcontest,
      tallies: buildCandidateTallies(1, presidentcontest),
      metadata: { overvotes: 3, undervotes: 2, ballots: 20 },
    };
    const tally2: ContestTally = {
      contest: presidentcontest,
      tallies: buildCandidateTallies(0, presidentcontest),
      metadata: { overvotes: 0, undervotes: 0, ballots: 0 },
    };
    expect(combineContestTallies(tally1, tally2)).toStrictEqual(tally1);
  });

  it('combines candidate tally with non-empty tally properly', () => {
    const tally1: ContestTally = {
      contest: presidentcontest,
      tallies: buildCandidateTallies(1, presidentcontest),
      metadata: { overvotes: 3, undervotes: 2, ballots: 20 },
    };
    const tally2: ContestTally = {
      contest: presidentcontest,
      tallies: buildCandidateTallies(2, presidentcontest),
      metadata: { overvotes: 1, undervotes: 1, ballots: 32 },
    };
    expect(combineContestTallies(tally1, tally2)).toStrictEqual(
      typedAs<ContestTally>({
        contest: presidentcontest,
        tallies: buildCandidateTallies(3, presidentcontest),
        metadata: { overvotes: 4, undervotes: 3, ballots: 52 },
      })
    );
  });

  it('throws error with mismatched contests', () => {
    const tally1: ContestTally = {
      contest: yesnocontest,
      tallies: {
        yes: { option: ['yes'], tally: 12 },
        no: { option: ['no'], tally: 32 },
      },
      metadata: { overvotes: 3, undervotes: 2, ballots: 49 },
    };
    const tally2: ContestTally = {
      contest: presidentcontest,
      tallies: buildCandidateTallies(2, presidentcontest),
      metadata: { overvotes: 1, undervotes: 1, ballots: 32 },
    };
    expect(() => combineContestTallies(tally1, tally2)).toThrow();
  });
});

describe('getTotalNumberOfBallots', () => {
  it('finds correct number of ballots for an election with 1 contest in all ballot styles', () => {
    const tally1: ContestTally = {
      contest: presidentcontest,
      tallies: {},
      metadata: { overvotes: 0, undervotes: 0, ballots: 53 },
    };
    const tally2: ContestTally = {
      contest: yesnocontest,
      tallies: {},
      metadata: { overvotes: 0, undervotes: 0, ballots: 37 },
    };
    const contestTallies: Dictionary<ContestTally> = {
      president: tally1,
      'question-a': tally2,
    };
    expect(getTotalNumberOfBallots(contestTallies, electionSample)).toEqual(53);
  });

  it('finds correct number of ballots for a primary election with disjoint ballot sets', () => {
    const contestTallies: Dictionary<ContestTally> = {};
    // The follow ballot counts per contest determined based on the following number of votes for each ballot style in the election.
    // 1L: 7, 2L: 12, 3C: 32, 4F: 25, 5F: 18, 6F: 21
    const talliesForContest: Dictionary<number> = {
      'governor-contest-liberty': 19,
      'governor-contest-constitution': 32,
      'governor-contest-federalist': 64,
      'mayor-contest-liberty': 7,
      'assistant-mayor-contest-liberty': 7,
      'mayor-contest-constitution': 32,
      'mayor-contest-federalist': 39,
      'chief-pokemon-liberty': 12,
      'chief-pokemon-constitution': 32,
      'chief-pokemon-federalist': 21,
      'schoolboard-liberty': 12,
      'schoolboard-constitution': 32,
      'schoolboard-federalist': 21,
    };
    for (const c of multiPartyPrimaryElection.contests) {
      contestTallies[c.id] = {
        contest: c,
        tallies: {},
        metadata: {
          overvotes: 0,
          undervotes: 0,
          ballots: talliesForContest[c.id]!,
        },
      };
    }

    // The total number of ballots is 115, if you sum up the votes for each ballot style
    // 7 + 12 + 32 + 25 + 18 + 21 you get 115 ballots, or the max of the votes in each disjoint
    // set of contests (each of the three primaries) 19 (liberty) + 32 (constitution) + 64 (federalist) = 115
    expect(
      getTotalNumberOfBallots(contestTallies, multiPartyPrimaryElection)
    ).toEqual(115);
  });
});

describe('getEmptyManualTalliesByPrecinct', () => {
  it('creates empty tallies for primary election', () => {
    const results = getEmptyManualTalliesByPrecinct(multiPartyPrimaryElection);
    for (const precinct of multiPartyPrimaryElection.precincts) {
      const precinctResults = results[precinct.id];
      expect(precinctResults).toBeDefined();
      expect(precinctResults!.numberOfBallotsCounted).toEqual(0);
      for (const contest of multiPartyPrimaryElection.contests) {
        const contestTally = precinctResults!.contestTallies[contest.id];
        expect(contestTally).toBeDefined();
        expect(contestTally!.metadata).toStrictEqual({
          ballots: 0,
          undervotes: 0,
          overvotes: 0,
        });
        for (const tally of Object.values(contestTally!.tallies)) {
          expect(tally!.tally).toEqual(0);
        }
      }
    }
  });

  it('creates empty tallies for either neither election', () => {
    const results = getEmptyManualTalliesByPrecinct(
      electionWithMsEitherNeither
    );
    for (const precinct of electionWithMsEitherNeither.precincts) {
      const precinctResults = results[precinct.id];
      expect(precinctResults).toBeDefined();
      expect(precinctResults!.numberOfBallotsCounted).toEqual(0);
      for (const contest of electionWithMsEitherNeither.contests) {
        const contestTally = precinctResults!.contestTallies[contest.id];
        expect(contestTally).toBeDefined();
        expect(contestTally!.metadata).toStrictEqual({
          ballots: 0,
          undervotes: 0,
          overvotes: 0,
        });
        for (const tally of Object.values(contestTally!.tallies)) {
          expect(tally!.tally).toEqual(0);
        }
      }
    }
  });
});

describe('convertManualTallyToStorageString, convertStorageStringToManualTally', () => {
  it('can convert to storage string and back to manual tally', () => {
    const singleVotes = buildManualTally(electionWithMsEitherNeither, 1, [
      '775020876',
      '750000017',
    ]);
    const doubleVotes = buildManualTally(electionWithMsEitherNeither, 2, [
      '775020876',
      '750000017',
    ]);
    const resultsByCategory = new Map();
    resultsByCategory.set(TallyCategory.Precinct, {
      '6522': singleVotes,
      '6524': singleVotes,
    });
    const fullTally1: FullElectionManualTally = {
      overallTally: doubleVotes,
      resultsByCategory,
      votingMethod: VotingMethod.Absentee,
      timestampCreated: new Date(1989, 11, 13),
    }; // Have information both in the main tally and results by category

    const storageString = convertManualTallyToStorageString(fullTally1);
    const recreatedTallies = convertStorageStringToManualTally(storageString);
    expect(recreatedTallies).toStrictEqual(fullTally1);
  });
});

describe('getPrecinctIdsInManualTally', () => {
  it('returns nothing if there are no results by precinct computed', () => {
    const emptyFullManualTally: FullElectionManualTally = {
      overallTally: getEmptyManualTally(),
      resultsByCategory: new Map(),
      votingMethod: VotingMethod.Precinct,
      timestampCreated: new Date(1989, 11, 13),
    };
    expect(getPrecinctIdsInManualTally(emptyFullManualTally)).toStrictEqual([]);
  });

  it('returns a subset of precincts with nonzero ballot totals', () => {
    const singleVotes = buildManualTally(electionWithMsEitherNeither, 1, [
      '775020876',
      '750000017',
    ]);
    const emptyVotes = buildManualTally(electionWithMsEitherNeither, 0, []);
    const resultsByCategory = new Map();
    resultsByCategory.set(TallyCategory.Precinct, {
      '6522': singleVotes,
      '6524': emptyVotes,
      '6527': singleVotes,
      '6532': emptyVotes,
    });
    const fullManualTally: FullElectionManualTally = {
      overallTally: getEmptyManualTally(),
      resultsByCategory,
      votingMethod: VotingMethod.Precinct,
      timestampCreated: new Date(1989, 11, 13),
    };
    // Precincts with 0 votes explicitly specified or just missing in the dictionary are not included
    expect(getPrecinctIdsInManualTally(fullManualTally)).toStrictEqual([
      '6522',
      '6527',
    ]);
  });
});

describe('filterManualTalliesByParams', () => {
  const emptyVotesEitherNeither = buildManualTally(
    electionWithMsEitherNeither,
    1,
    ['775020876', '750000017']
  );
  const singleVotesEitherNeither = buildManualTally(
    electionWithMsEitherNeither,
    1,
    ['775020876', '750000017']
  );
  const doubleVotesEitherNeither = buildManualTally(
    electionWithMsEitherNeither,
    2,
    ['775020876', '750000017']
  );
  const sharedResultsByCategory = new Map();
  sharedResultsByCategory.set(TallyCategory.Precinct, {
    '6522': singleVotesEitherNeither,
    '6524': singleVotesEitherNeither,
    '6529': emptyVotesEitherNeither,
  });
  const sharedFullTally: FullElectionManualTally = {
    overallTally: doubleVotesEitherNeither,
    resultsByCategory: sharedResultsByCategory,
    votingMethod: VotingMethod.Absentee,
    timestampCreated: new Date(1989, 11, 13),
  };
  it('returns undefined when the inputted tally is undefined', () => {
    expect(
      filterManualTalliesByParams(undefined, electionWithMsEitherNeither, {})
    ).toEqual(undefined);
  });
  it('returns undefined when filtering by an unsupported parameter', () => {
    expect(
      filterManualTalliesByParams(
        sharedFullTally,
        electionWithMsEitherNeither,
        { scannerId: '1' }
      )
    ).toEqual(undefined);
  });

  it('returns an empty tally when filtering for a different voting method', () => {
    expect(
      filterManualTalliesByParams(
        sharedFullTally,
        electionWithMsEitherNeither,
        { votingMethod: VotingMethod.Precinct }
      )
    ).toStrictEqual(getEmptyManualTally());
  });

  it('returns the current tally when filtering for a matching voting method', () => {
    expect(
      filterManualTalliesByParams(
        sharedFullTally,
        electionWithMsEitherNeither,
        { votingMethod: VotingMethod.Absentee }
      )
    ).toStrictEqual(doubleVotesEitherNeither);
  });

  it('filters by precinct as expected', () => {
    expect(
      filterManualTalliesByParams(
        sharedFullTally,
        electionWithMsEitherNeither,
        { precinctId: '6524' }
      )
    ).toStrictEqual(singleVotesEitherNeither);

    expect(
      filterManualTalliesByParams(
        sharedFullTally,
        electionWithMsEitherNeither,
        { precinctId: '6524', votingMethod: VotingMethod.Absentee }
      )
    ).toStrictEqual(singleVotesEitherNeither);

    expect(
      filterManualTalliesByParams(
        sharedFullTally,
        electionWithMsEitherNeither,
        { precinctId: '6524', votingMethod: VotingMethod.Precinct }
      )
    ).toStrictEqual(getEmptyManualTally());

    expect(
      filterManualTalliesByParams(
        sharedFullTally,
        electionWithMsEitherNeither,
        { precinctId: '6529' }
      )
    ).toStrictEqual(emptyVotesEitherNeither);
    expect(
      filterManualTalliesByParams(
        sharedFullTally,
        electionWithMsEitherNeither,
        { precinctId: '6529', votingMethod: VotingMethod.Absentee }
      )
    ).toStrictEqual(emptyVotesEitherNeither);
    expect(
      filterManualTalliesByParams(
        sharedFullTally,
        electionWithMsEitherNeither,
        { precinctId: '6537' }
      )
    ).toStrictEqual(getEmptyManualTally());
  });

  it('filters by party as expected', () => {
    const libertyPartyId = unsafeParse(PartyIdSchema, '0');
    const constitutionPartyId = unsafeParse(PartyIdSchema, '3');
    const federalistPartyId = unsafeParse(PartyIdSchema, '4');
    const singleVotesPrimary = buildManualTally(multiPartyPrimaryElection, 1, [
      'governor-contest-liberty',
      'mayor-contest-liberty',
      'governor-contest-constitution',
      'governor-contest-federalist',
    ]);
    const fullTally: FullElectionManualTally = {
      overallTally: singleVotesPrimary,
      resultsByCategory: new Map(),
      votingMethod: VotingMethod.Absentee,
      timestampCreated: new Date(1989, 11, 13),
    };
    const libertyResults = filterManualTalliesByParams(
      fullTally,
      multiPartyPrimaryElection,
      {
        partyId: libertyPartyId,
      }
    );
    expect(
      libertyResults?.contestTallies['governor-contest-liberty']
    ).toStrictEqual(
      singleVotesPrimary.contestTallies['governor-contest-liberty']
    );
    expect(
      libertyResults?.contestTallies['mayor-contest-liberty']
    ).toStrictEqual(singleVotesPrimary.contestTallies['mayor-contest-liberty']);
    expect(libertyResults?.contestTallies).not.toHaveProperty(
      'governor-contest-constitution'
    );
    expect(libertyResults?.contestTallies).not.toHaveProperty(
      'governor-contest-federalist'
    );

    const constitutionResults = filterManualTalliesByParams(
      fullTally,
      multiPartyPrimaryElection,
      {
        partyId: constitutionPartyId,
      }
    );
    expect(
      constitutionResults?.contestTallies['governor-contest-constitution']
    ).toStrictEqual(
      singleVotesPrimary.contestTallies['governor-contest-constitution']
    );
    expect(constitutionResults?.contestTallies).not.toHaveProperty(
      'governor-contest-liberty'
    );
    expect(constitutionResults?.contestTallies).not.toHaveProperty(
      'mayor-contest-liberty'
    );
    expect(constitutionResults?.contestTallies).not.toHaveProperty(
      'governor-contest-federalist'
    );
    const federalistResults = filterManualTalliesByParams(
      fullTally,
      multiPartyPrimaryElection,
      {
        partyId: federalistPartyId,
      }
    );
    expect(
      federalistResults?.contestTallies['governor-contest-federalist']
    ).toStrictEqual(
      singleVotesPrimary.contestTallies['governor-contest-federalist']
    );
    expect(federalistResults?.contestTallies).not.toHaveProperty(
      'governor-contest-constitution'
    );
    expect(federalistResults?.contestTallies).not.toHaveProperty(
      'mayor-contest-liberty'
    );
    expect(federalistResults?.contestTallies).not.toHaveProperty(
      'governor-contest-liberty'
    );

    // Filtering by voting method with party works as expected
    expect(
      filterManualTalliesByParams(fullTally, multiPartyPrimaryElection, {
        partyId: federalistPartyId,
        votingMethod: VotingMethod.Precinct,
      })
    ).toStrictEqual(getEmptyManualTally());
    expect(
      filterManualTalliesByParams(fullTally, multiPartyPrimaryElection, {
        partyId: federalistPartyId,
        votingMethod: VotingMethod.Absentee,
      })
    ).toStrictEqual(federalistResults);

    // Filtering by precinct voting method and party works as expected
    const doubleVotesPrimary = buildManualTally(multiPartyPrimaryElection, 2, [
      'governor-contest-liberty',
      'mayor-contest-liberty',
      'governor-contest-constitution',
      'governor-contest-federalist',
    ]);
    const resultsByCategory = new Map();
    resultsByCategory.set(TallyCategory.Precinct, {
      'precinct-1': singleVotesPrimary,
      'precinct-2': singleVotesPrimary,
    });
    const fullTallyManual: FullElectionManualTally = {
      overallTally: doubleVotesPrimary,
      resultsByCategory,
      votingMethod: VotingMethod.Precinct,
      timestampCreated: new Date(1989, 11, 13),
    };
    const precinct1Liberty = filterManualTalliesByParams(
      fullTallyManual,
      multiPartyPrimaryElection,
      {
        precinctId: 'precinct-1',
        partyId: libertyPartyId,
        votingMethod: VotingMethod.Precinct,
      }
    );
    expect(precinct1Liberty).toStrictEqual(libertyResults);
    const precinct3Liberty = filterManualTalliesByParams(
      fullTallyManual,
      multiPartyPrimaryElection,
      {
        precinctId: 'precinct-3',
        partyId: libertyPartyId,
        votingMethod: VotingMethod.Precinct,
      }
    );
    expect(precinct3Liberty).toStrictEqual(getEmptyManualTally());
  });
});

describe('convertTalliesByPrecinctToFullManualTally', () => {
  it('combines precincts as expected', () => {
    const libertyPartyId = unsafeParse(PartyIdSchema, '0');
    const constitutionPartyId = unsafeParse(PartyIdSchema, '3');
    const federalistPartyId = unsafeParse(PartyIdSchema, '4');
    // Contests to populate for the purposes of these tests.
    const contestIds = [
      'governor-contest-liberty',
      'mayor-contest-liberty',
      'governor-contest-constitution',
      'governor-contest-federalist',
    ];
    const emptyVotesPrimary = buildManualTally(
      multiPartyPrimaryElection,
      0,
      contestIds
    );
    const singleVotesPrimary = buildManualTally(
      multiPartyPrimaryElection,
      1,
      contestIds
    );
    const doubleVotesPrimary = buildManualTally(
      multiPartyPrimaryElection,
      2,
      contestIds
    );
    const resultsByPrecinct: Dictionary<ManualTally> = {
      'precinct-1': singleVotesPrimary,
      'precinct-2': singleVotesPrimary,
      'precinct-3': doubleVotesPrimary,
      'precinct-4': doubleVotesPrimary,
      'precinct-5': emptyVotesPrimary,
    };
    const results = convertTalliesByPrecinctToFullManualTally(
      resultsByPrecinct,
      multiPartyPrimaryElection,
      VotingMethod.Absentee,
      new Date(2020, 3, 1)
    );
    expect(results.overallTally).toStrictEqual(
      buildManualTally(multiPartyPrimaryElection, 6, contestIds)
    );
    expect(results.votingMethod).toEqual(VotingMethod.Absentee);
    expect(results.timestampCreated).toStrictEqual(new Date(2020, 3, 1));
    expect([...results.resultsByCategory.keys()]).toStrictEqual([
      TallyCategory.Precinct,
      TallyCategory.Party,
    ]);
    expect(results.resultsByCategory.get(TallyCategory.Precinct)).toStrictEqual(
      resultsByPrecinct
    );
    const resultsByParty = results.resultsByCategory.get(TallyCategory.Party);
    expect(resultsByParty).toStrictEqual({
      [libertyPartyId]: filterManualTalliesByParams(
        results,
        multiPartyPrimaryElection,
        {
          partyId: libertyPartyId,
        }
      ),
      [constitutionPartyId]: filterManualTalliesByParams(
        results,
        multiPartyPrimaryElection,
        {
          partyId: constitutionPartyId,
        }
      ),
      [federalistPartyId]: filterManualTalliesByParams(
        results,
        multiPartyPrimaryElection,
        {
          partyId: federalistPartyId,
        }
      ),
    });
  });
});
