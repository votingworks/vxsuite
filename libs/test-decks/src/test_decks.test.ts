import { describe, expect, test } from 'vitest';
import {
  readElectionGeneral,
  electionFamousNames2021Fixtures,
  electionPrimaryPrecinctSplitsFixtures,
} from '@votingworks/fixtures';
import {
  BallotStyle,
  CandidateContest,
  CandidateVote,
  Dictionary,
  Election,
  getBallotStyle,
  getContests,
  BallotMeasureVote,
} from '@votingworks/types';
import { deepEqual, unique, assert, find } from '@votingworks/basics';
import { buildContestResultsFixture } from '@votingworks/utils';
import {
  generateTestDeckWriteIn,
  numBallotPositions,
  getTestDeckCandidateAtIndex,
  generateTestDeckBallots,
  generateTestDeckCastVoteRecords,
  getTallyReportResults,
} from './test_decks';

const electionGeneral = readElectionGeneral();

describe('numBallotPositions', () => {
  test('returns 2 for yes-no contests', () => {
    const yesNoContest = electionGeneral.contests[13];
    expect(numBallotPositions(yesNoContest)).toEqual(2);
  });

  test('returns correct count for candidate contest without write-in', () => {
    const contest = electionGeneral.contests[0] as CandidateContest;
    expect(numBallotPositions(contest)).toEqual(contest.candidates.length);
  });

  test('returns correct count for candidate contest with write-in', () => {
    const contest = electionGeneral.contests[8] as CandidateContest;
    expect(numBallotPositions(contest)).toEqual(
      contest.candidates.length + contest.seats
    );
  });
});

test('generateTestDeckWriteIn generates valid write-in candidate', () => {
  const testIndex = 0;
  const testDeckWriteIn = generateTestDeckWriteIn(testIndex);
  expect(testDeckWriteIn.isWriteIn).toEqual(true);
  expect(testDeckWriteIn.id).toEqual('write-in');
  expect(testDeckWriteIn.name).toEqual('WRITE-IN');
  expect(testDeckWriteIn.writeInIndex).toEqual(testIndex);
});

describe('getTestDeckCandidateAtIndex', () => {
  test('returns candidate if index is less than number of candidates', () => {
    const contest = electionGeneral.contests[0] as CandidateContest;
    expect(getTestDeckCandidateAtIndex(contest, 0)).toEqual(
      contest.candidates[0]
    );
  });

  test('returns test deck write in if allowed and in range', () => {
    const contest = electionGeneral.contests[8] as CandidateContest;
    const candidate = getTestDeckCandidateAtIndex(
      contest,
      contest.candidates.length
    );
    expect(candidate.id).toEqual('write-in');
    expect(candidate.isWriteIn).toEqual(true);
    expect(candidate.writeInIndex).toEqual(0);
  });

  test('throws error if index out of bounds', () => {
    const contest = electionGeneral.contests[0] as CandidateContest;
    expect(() => {
      getTestDeckCandidateAtIndex(contest, contest.candidates.length);
    }).toThrowError();
  });
});

describe('generateTestDeckBallots', () => {
  test('generates a list of ballots with a vote for every ballot choice, as well as blank and overvoted ballots', () => {
    // Precinct with id '23' has one ballot style, with id '12', representing
    // races for 'district-2'
    const ballots = generateTestDeckBallots({
      election: electionGeneral,
      precinctId: '23',
      ballotFormat: 'bubble',
    });
    const votes = ballots.map((b) => b.votes);
    const ballotStyle = getBallotStyle({
      ballotStyleId: '12',
      election: electionGeneral,
    }) as BallotStyle;
    const contests = getContests({ ballotStyle, election: electionGeneral });

    const allSelections: Dictionary<string[]> = {};
    for (const contest of contests) {
      if (contest.type === 'measure') {
        allSelections[contest.id] = unique(
          votes.flatMap((vote) => (vote[contest.id] ?? []) as BallotMeasureVote)
        );
      } else if (contest.type === 'candidate') {
        const allCandidateVotes = votes.flatMap(
          (vote) => (vote[contest.id] ?? []) as CandidateVote
        );

        allSelections[contest.id] = unique(
          allCandidateVotes.map((candidate) => {
            if (candidate.id === 'write-in') {
              return `write-in-${candidate.writeInIndex}`;
            }
            return candidate.id;
          })
        );
      }
    }
    expect(allSelections).toMatchObject({
      senator: [
        'weiford',
        'garriss',
        'wentworthfarthington',
        'hewetson',
        'martinez',
        'brown',
        'pound',
      ],
      governor: [
        'franz',
        'harris',
        'bargmann',
        'abcock',
        'steelloy',
        'sharp',
        'wallace',
        'williams',
        'sharp-althea',
        'alpern',
        'windbeck',
        'greher',
        'alexander',
        'mitchell',
        'lee',
        'ash',
      ],
      'secretary-of-state': ['shamsi', 'talarico'],
      'county-commissioners': [
        'argent',
        'witherspoonsmithson',
        'bainbridge',
        'hennessey',
        'savoy',
        'tawa',
        'tawa-mary',
        'rangel-damian',
        'altman',
        'moore',
        'schreiner',
        'write-in-0',
        'write-in-1',
        'write-in-2',
        'write-in-3',
      ],
      'city-mayor': ['white', 'seldon', 'write-in-0'],
      'city-council': [
        'eagle',
        'rupp',
        'shry',
        'barker',
        'davis',
        'smith',
        'write-in-0',
        'write-in-1',
        'write-in-2',
      ],
      'judicial-elmer-hull': [
        'judicial-elmer-hull-option-yes',
        'judicial-elmer-hull-option-no',
      ],
      'question-c': ['question-c-option-yes', 'question-c-option-no'],
      'measure-101': ['measure-101-option-yes', 'measure-101-option-no'],
    });

    const blankBallots = ballots.filter((ballot) =>
      deepEqual(ballot.votes, {})
    );
    expect(blankBallots.length).toEqual(2);
    const overvotedBallots = ballots.filter((ballot) =>
      Object.entries(ballot.votes).some(([contestId, vote]) => {
        const contest = contests.find((c) => c.id === contestId)!;
        return (
          vote &&
          vote.length > (contest.type === 'candidate' ? contest.seats : 1)
        );
      })
    );
    expect(overvotedBallots.length).toEqual(1);
  });

  test('can generate an overvote for a yes-no contest', () => {
    const electionWithOnlyYesNoContests: Election = {
      ...electionGeneral,
      contests: electionGeneral.contests.filter(
        (contest) => contest.type === 'measure'
      ),
    };
    const ballots = generateTestDeckBallots({
      election: electionWithOnlyYesNoContests,
      precinctId: electionWithOnlyYesNoContests.precincts[0].id,
      ballotFormat: 'bubble',
    });
    const overvotedBallots = ballots.filter((ballot) =>
      Object.values(ballot.votes).some((vote) => vote && vote.length > 1)
    );
    expect(overvotedBallots.length).toEqual(1);
  });

  test('generates ballots for all precincts if no precinctId is provided', () => {
    const ballots = generateTestDeckBallots({
      election: electionGeneral,
      ballotFormat: 'summary',
    });
    const precinctsWithBallotStyles = electionGeneral.precincts.filter((p) =>
      electionGeneral.ballotStyles.some((bs) => bs.precincts.includes(p.id))
    );
    const ballotPrecinctIds = unique(ballots.map((b) => b.precinctId));
    expect(ballotPrecinctIds).toEqual(
      precinctsWithBallotStyles.map((p) => p.id)
    );
  });
});

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
