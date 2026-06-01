import { describe, expect, test } from 'vitest';
import { readElectionGeneral } from '@votingworks/fixtures';
import {
  BallotStyle,
  CandidateContest,
  CandidateVote,
  Dictionary,
  Election,
  getBallotStyle,
  getContests,
  StraightPartyContest,
  YesNoVote,
} from '@votingworks/types';
import { deepEqual, unique } from '@votingworks/basics';
import {
  generateTestDeckWriteIn,
  numBallotPositions,
  getTestDeckCandidateAtIndex,
  generateTestDeckBallots,
} from './test_deck_ballots';

const electionGeneral = readElectionGeneral();

describe('numBallotPositions', () => {
  test('returns 2 for yes-no contests', () => {
    const yesNoContest = electionGeneral.contests[13]!;
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
      if (contest.type === 'yesno') {
        allSelections[contest.id] = unique(
          votes.flatMap((vote) => (vote[contest.id] ?? []) as YesNoVote)
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
        (contest) => contest.type === 'yesno'
      ),
    };
    const ballots = generateTestDeckBallots({
      election: electionWithOnlyYesNoContests,
      precinctId: electionWithOnlyYesNoContests.precincts[0]!.id,
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

  test('generates straight-party votes that rotate through parties', () => {
    const spContest: StraightPartyContest = {
      id: 'sp-1',
      type: 'straight-party',
      title: 'Straight Party Ticket',
    };
    const electionWithSp: Election = {
      ...electionGeneral,
      contests: [spContest, ...electionGeneral.contests],
    };

    const ballots = generateTestDeckBallots({
      election: electionWithSp,
      ballotFormat: 'bubble',
      includeOvervotedBallots: true,
      includeBlankBallots: false,
    });

    const ballotsWithSpVotes = ballots.filter((b) => b.votes['sp-1']);
    expect(ballotsWithSpVotes.length).toBeGreaterThan(0);

    // Every SP vote should be a single party from the election
    const validPartyIds = new Set(electionWithSp.parties.map((p) => p.id));
    for (const ballot of ballotsWithSpVotes) {
      const spVote = ballot.votes['sp-1'];
      expect(spVote).toHaveLength(1);
      expect(validPartyIds.has(spVote![0] as string)).toEqual(true);
    }
  });

  test('overvote ballot generation skips straight-party-only elections', () => {
    const spContest: StraightPartyContest = {
      id: 'sp-1',
      type: 'straight-party',
      title: 'Straight Party Ticket',
    };
    // Election where the only contest is straight-party — there are no
    // yesno/candidate contests for the overvote ballot generator to pick.
    const electionSpOnly: Election = {
      ...electionGeneral,
      contests: [spContest],
    };

    const ballots = generateTestDeckBallots({
      election: electionSpOnly,
      ballotFormat: 'bubble',
      includeOvervotedBallots: true,
      includeBlankBallots: false,
    });

    // No ballot should contain an overvote for the SP contest (the overvote
    // logic doesn't apply to SP)
    for (const ballot of ballots) {
      const spVote = ballot.votes['sp-1'];
      if (spVote) expect(spVote.length).toBeLessThanOrEqual(1);
    }
  });
});
