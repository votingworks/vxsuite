import { describe, expect, test } from 'vitest';
import { assert, find } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  electionPrimaryPrecinctSplitsFixtures,
} from '@votingworks/fixtures';
import { buildContestResultsFixture } from './tabulation/tabulation';
import {
  generateTestDeckCastVoteRecords,
  getTallyReportResults,
} from './test_deck_tally_reports';

describe('getTallyReportResults', () => {
  test('general election without summary ballots', async () => {
    const election = electionFamousNames2021Fixtures.readElection();

    const cvrs = generateTestDeckCastVoteRecords(election, {
      includeSummaryBallots: false,
    });
    const tallyReportResults = await getTallyReportResults(election, cvrs);

    expect(tallyReportResults.hasPartySplits).toEqual(false);
    expect(tallyReportResults.contestIds).toEqual(
      election.contests.map((c) => c.id)
    );
    expect(tallyReportResults.manualResults).toBeUndefined();
    const { scannedResults } = tallyReportResults;
    expect(scannedResults.cardCounts).toEqual({
      bmd: [],
      hmpb: [52],
    });

    expect(scannedResults.contestResults['board-of-alderman']).toEqual(
      buildContestResultsFixture({
        contest: find(election.contests, (c) => c.id === 'board-of-alderman'),
        contestResultsSummary: {
          type: 'candidate',
          ballots: 52,
          overvotes: 0,
          undervotes: 156,
          officialOptionTallies: {
            'helen-keller': 8,
            'nikola-tesla': 8,
            'pablo-picasso': 4,
            'steve-jobs': 8,
            'vincent-van-gogh': 4,
            'wolfgang-amadeus-mozart': 4,
            'write-in': 16,
          },
        },
        includeGenericWriteIn: true,
      })
    );
  });

  test('general election with summary ballots doubles the counts', async () => {
    const election = electionFamousNames2021Fixtures.readElection();

    const cvrs = generateTestDeckCastVoteRecords(election, {
      includeSummaryBallots: true,
    });
    const tallyReportResults = await getTallyReportResults(election, cvrs);

    expect(tallyReportResults.hasPartySplits).toEqual(false);
    const { scannedResults } = tallyReportResults;
    expect(scannedResults.cardCounts).toEqual({
      bmd: [52],
      hmpb: [52],
    });

    expect(scannedResults.contestResults['board-of-alderman']).toEqual(
      buildContestResultsFixture({
        contest: find(election.contests, (c) => c.id === 'board-of-alderman'),
        contestResultsSummary: {
          type: 'candidate',
          ballots: 104,
          overvotes: 0,
          undervotes: 312,
          officialOptionTallies: {
            'helen-keller': 16,
            'nikola-tesla': 16,
            'pablo-picasso': 8,
            'steve-jobs': 16,
            'vincent-van-gogh': 8,
            'wolfgang-amadeus-mozart': 8,
            'write-in': 32,
          },
        },
        includeGenericWriteIn: true,
      })
    );
  });

  test('primary election without summary ballots', async () => {
    const election = electionPrimaryPrecinctSplitsFixtures.readElection();

    const cvrs = generateTestDeckCastVoteRecords(election, {
      includeSummaryBallots: false,
    });
    const tallyReportResults = await getTallyReportResults(election, cvrs);

    expect(tallyReportResults.hasPartySplits).toEqual(true);
    expect(tallyReportResults.contestIds).toEqual(
      election.contests.map((c) => c.id)
    );
    expect(tallyReportResults.manualResults).toBeUndefined();
    expect(
      tallyReportResults.hasPartySplits && tallyReportResults.cardCountsByParty
    ).toEqual({
      '0': {
        bmd: [],
        hmpb: [100],
      },
      '1': {
        bmd: [],
        hmpb: [100],
      },
    });
    const { scannedResults } = tallyReportResults;
    expect(scannedResults.cardCounts).toEqual({
      bmd: [],
      hmpb: [200],
      manual: 0,
    });

    expect(scannedResults.contestResults['county-leader-mammal']).toEqual(
      buildContestResultsFixture({
        contest: find(
          election.contests,
          (c) => c.id === 'county-leader-mammal'
        ),
        contestResultsSummary: {
          type: 'candidate',
          ballots: 100,
          overvotes: 0,
          undervotes: 0,
          officialOptionTallies: {
            fox: 20,
            horse: 40,
            otter: 40,
          },
        },
        includeGenericWriteIn: false,
      })
    );
  });

  test('primary election with summary ballots doubles the counts', async () => {
    const election = electionPrimaryPrecinctSplitsFixtures.readElection();

    const cvrs = generateTestDeckCastVoteRecords(election, {
      includeSummaryBallots: true,
    });
    const tallyReportResults = await getTallyReportResults(election, cvrs);

    expect(tallyReportResults.hasPartySplits).toEqual(true);
    expect(
      tallyReportResults.hasPartySplits && tallyReportResults.cardCountsByParty
    ).toEqual({
      '0': {
        bmd: [100],
        hmpb: [100],
      },
      '1': {
        bmd: [100],
        hmpb: [100],
      },
    });
    const { scannedResults } = tallyReportResults;
    expect(scannedResults.cardCounts).toEqual({
      bmd: [200],
      hmpb: [200],
      manual: 0,
    });

    expect(scannedResults.contestResults['county-leader-mammal']).toEqual(
      buildContestResultsFixture({
        contest: find(
          election.contests,
          (c) => c.id === 'county-leader-mammal'
        ),
        contestResultsSummary: {
          type: 'candidate',
          ballots: 200,
          overvotes: 0,
          undervotes: 0,
          officialOptionTallies: {
            fox: 40,
            horse: 80,
            otter: 80,
          },
        },
        includeGenericWriteIn: false,
      })
    );
  });

  test('general election precinct-specific results', async () => {
    const election = electionFamousNames2021Fixtures.readElection();
    const precinct = election.precincts[0];
    assert(precinct);

    const cvrs = generateTestDeckCastVoteRecords(election, {
      includeSummaryBallots: false,
    });
    const precinctCvrs = cvrs.filter((cvr) => cvr.precinctId === precinct.id);
    const tallyReportResults = await getTallyReportResults(
      election,
      precinctCvrs,
      precinct.id
    );

    expect(tallyReportResults.hasPartySplits).toEqual(false);
    expect(tallyReportResults.contestIds.length).toEqual(8);
    const { scannedResults } = tallyReportResults;
    expect(scannedResults.cardCounts).toEqual({
      bmd: [],
      hmpb: [13],
    });

    expect(scannedResults.contestResults['board-of-alderman']).toEqual(
      buildContestResultsFixture({
        contest: find(election.contests, (c) => c.id === 'board-of-alderman'),
        contestResultsSummary: {
          type: 'candidate',
          ballots: 13,
          overvotes: 0,
          undervotes: 39,
          officialOptionTallies: {
            'helen-keller': 2,
            'nikola-tesla': 2,
            'pablo-picasso': 1,
            'steve-jobs': 2,
            'vincent-van-gogh': 1,
            'wolfgang-amadeus-mozart': 1,
            'write-in': 4,
          },
        },
        includeGenericWriteIn: true,
      })
    );
  });

  test('primary election precinct-specific results', async () => {
    const election = electionPrimaryPrecinctSplitsFixtures.readElection();
    const precinct = election.precincts[0];
    assert(precinct);

    const cvrs = generateTestDeckCastVoteRecords(election, {
      includeSummaryBallots: false,
    });
    const precinctCvrs = cvrs.filter((cvr) => cvr.precinctId === precinct.id);
    const tallyReportResults = await getTallyReportResults(
      election,
      precinctCvrs,
      precinct.id
    );

    expect(tallyReportResults.hasPartySplits).toEqual(true);
    assert(tallyReportResults.hasPartySplits);
    expect(tallyReportResults.contestIds.length).toEqual(5);
    expect(tallyReportResults.cardCountsByParty).toEqual({
      '0': {
        bmd: [],
        hmpb: [20],
      },
      '1': {
        bmd: [],
        hmpb: [20],
      },
    });
    const { scannedResults } = tallyReportResults;
    expect(scannedResults.cardCounts).toEqual({
      bmd: [],
      hmpb: [40],
      manual: 0,
    });

    expect(scannedResults.contestResults['county-leader-mammal']).toEqual(
      buildContestResultsFixture({
        contest: find(
          election.contests,
          (c) => c.id === 'county-leader-mammal'
        ),
        contestResultsSummary: {
          type: 'candidate',
          ballots: 20,
          overvotes: 0,
          undervotes: 0,
          officialOptionTallies: {
            fox: 4,
            horse: 8,
            otter: 8,
          },
        },
        includeGenericWriteIn: false,
      })
    );
  });
});
