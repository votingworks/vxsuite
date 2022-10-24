import { Admin } from '@votingworks/api';
import { electionSample } from '@votingworks/fixtures';
import {
  BallotStyle,
  CandidateContest,
  CandidateVote,
  Dictionary,
  Election,
  getBallotStyle,
  getContests,
  YesNoVote,
} from '@votingworks/types';
import arrayUnique from 'array-unique';
import {
  getBallotPath,
  generateOvervoteBallot,
  generateTestDeckWriteIn,
  numBallotPositions,
  getTestDeckCandidateAtIndex,
  generateTestDeckBallots,
} from './election';

test('getBallotPath allows digits in file names', () => {
  expect(
    getBallotPath({
      election: electionSample,
      electionHash: 'd34db33f',
      ballotStyleId: '77',
      precinctId: '21',
      locales: { primary: 'en-US' },
      ballotMode: Admin.BallotMode.Official,
      isAbsentee: true,
    })
  ).toEqual(
    'election-d34db33f-precinct-north-springfield-id-21-style-77-English-live-absentee.pdf'
  );
});

describe('generateOvervoteBallot', () => {
  const precinctId = electionSample.precincts[0].id;

  test('minimally overvotes an initial candidate contest', () => {
    const overvoteBallot = generateOvervoteBallot({
      election: electionSample,
      precinctId,
    });
    expect(overvoteBallot).toBeDefined();

    const { votes } = overvoteBallot!;
    const presidential = electionSample.contests[0] as CandidateContest;
    expect(votes).toEqual({
      president: [presidential.candidates[0], presidential.candidates[1]],
    });
  });

  test('overvotes an initial yes-no contest', () => {
    // Remove all but the yes-no contests
    const election: Election = {
      ...electionSample,
      contests: electionSample.contests.filter((c) => c.type === 'yesno'),
    };

    const overvoteBallot = generateOvervoteBallot({
      election,
      precinctId,
    });
    expect(overvoteBallot).toBeDefined();

    const { votes } = overvoteBallot!;
    expect(votes).toEqual({ 'judicial-robert-demergue': ['yes', 'no'] });
  });

  test('overvotes the second contest if first contest is not overvotable', () => {
    // Remove all but one candidate from the first contest
    const candidateContest = electionSample.contests[0] as CandidateContest;
    const candidateContestWithOneCandidate: CandidateContest = {
      ...candidateContest,
      candidates: [candidateContest.candidates[0]],
    };
    const election: Election = {
      ...electionSample,
      contests: [
        candidateContestWithOneCandidate,
        ...electionSample.contests.slice(1),
      ],
    };

    const overvoteBallot = generateOvervoteBallot({
      election,
      precinctId,
    });
    expect(overvoteBallot).toBeDefined();

    const { votes } = overvoteBallot!;
    const senatorialContest = election.contests[1] as CandidateContest;
    expect(votes).toEqual({
      senator: [
        senatorialContest.candidates[0],
        senatorialContest.candidates[1],
      ],
    });
  });

  test('returns undefined if there are no overvotable contests', () => {
    // Remove all but the first contest and all but one candidate from that contest
    const candidateContest = electionSample.contests[0] as CandidateContest;
    const candidateContestWithOneCandidate: CandidateContest = {
      ...candidateContest,
      candidates: [candidateContest.candidates[0]],
    };
    const election: Election = {
      ...electionSample,
      contests: [candidateContestWithOneCandidate],
    };

    const overvoteBallot = generateOvervoteBallot({
      election,
      precinctId,
    });
    expect(overvoteBallot).toBeUndefined();
  });
});

describe('numBallotPositions', () => {
  test('returns 2 for yes-no contests', () => {
    const yesNoContest = electionSample.contests[13];
    expect(numBallotPositions(yesNoContest)).toBe(2);
  });

  test('returns correct count for candidate contest without write-in', () => {
    const contest = electionSample.contests[0] as CandidateContest;
    expect(numBallotPositions(contest)).toBe(contest.candidates.length);
  });

  test('returns correct count for candidate contest with write-in', () => {
    const contest = electionSample.contests[8] as CandidateContest;
    expect(numBallotPositions(contest)).toBe(
      contest.candidates.length + contest.seats
    );
  });
});

test('generateTestDeckWriteIn generates valid write-in candidate', () => {
  const testIndex = 0;
  const testDeckWriteIn = generateTestDeckWriteIn(testIndex);
  expect(testDeckWriteIn.isWriteIn).toBe(true);
  expect(testDeckWriteIn.id).toBe('write-in');
  expect(testDeckWriteIn.name).toBe('WRITE-IN');
  expect(testDeckWriteIn.writeInIndex).toBe(testIndex);
});

describe('getTestDeckCandidateAtIndex', () => {
  test('returns candidate if index is less than number of candidates', () => {
    const contest = electionSample.contests[0] as CandidateContest;
    expect(getTestDeckCandidateAtIndex(contest, 0)).toBe(contest.candidates[0]);
  });

  test('returns test deck write in if allowed and in range', () => {
    const contest = electionSample.contests[8] as CandidateContest;
    const candidate = getTestDeckCandidateAtIndex(
      contest,
      contest.candidates.length
    );
    expect(candidate.id).toBe('write-in');
    expect(candidate.isWriteIn).toBe(true);
    expect(candidate.writeInIndex).toBe(0);
  });

  test('throws error if index out of bounds', () => {
    const contest = electionSample.contests[0] as CandidateContest;
    expect(() => {
      getTestDeckCandidateAtIndex(contest, contest.candidates.length);
    }).toThrowError();
  });
});

describe('generateTestDeckBallots', () => {
  test('generates a list of ballots with a vote for every ballot choice', () => {
    // Precinct with id '23' has one ballot style, with id '12', representing
    // races for 'district-2'
    const ballots = generateTestDeckBallots({
      election: electionSample,
      precinctId: '23',
    });
    const votes = ballots.map((b) => b.votes);
    const ballotStyle = getBallotStyle({
      ballotStyleId: '12',
      election: electionSample,
    }) as BallotStyle;
    const contests = getContests({ ballotStyle, election: electionSample });

    const allSelections: Dictionary<string[]> = {};
    for (const contest of contests) {
      if (contest.type === 'yesno') {
        allSelections[contest.id] = arrayUnique(
          votes.flatMap((vote) => vote[contest.id] as YesNoVote)
        );
      } else if (contest.type === 'candidate') {
        const allCandidateVotes = votes.flatMap(
          (vote) => vote[contest.id] as CandidateVote
        );

        allSelections[contest.id] = arrayUnique(
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
        'rangel',
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
      'judicial-elmer-hull': ['yes', 'no'],
      'question-c': ['yes', 'no'],
      'measure-101': ['yes', 'no'],
    });
  });
});
