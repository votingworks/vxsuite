import { electionSample } from '@votingworks/fixtures';
import { CandidateContest } from '@votingworks/types';
import _ from 'lodash';
import { getBallotPath, generateOvervoteBallot } from './election';

test('getBallotPath allows digits in file names', () => {
  expect(
    getBallotPath({
      election: electionSample,
      electionHash: 'd34db33f',
      ballotStyleId: '77',
      precinctId: '21',
      locales: { primary: 'en-US' },
      isLiveMode: true,
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
    const election = _.cloneDeep(electionSample);

    // remove all but the yes-no contests
    _.remove(election.contests, (c) => c.type !== 'yesno');

    const overvoteBallot = generateOvervoteBallot({
      election,
      precinctId,
    });
    expect(overvoteBallot).toBeDefined();

    const { votes } = overvoteBallot!;
    expect(votes).toEqual({ 'judicial-robert-demergue': ['yes', 'no'] });
  });

  test('overvotes the second contest if first contest is not overvotable', () => {
    const election = _.cloneDeep(electionSample);

    // remove all but one candidate from first contest
    const presidential = election.contests[0] as CandidateContest;
    _.remove(presidential.candidates, (c) => c.partyId !== '0');

    const overvoteBallot = generateOvervoteBallot({
      election,
      precinctId,
    });
    expect(overvoteBallot).toBeDefined();

    const { votes } = overvoteBallot!;
    const senatorial = election.contests[1] as CandidateContest;
    expect(votes).toEqual({
      senator: [senatorial.candidates[0], senatorial.candidates[1]],
    });
  });

  test('returns null if there are no overvotable contests', () => {
    const election = _.cloneDeep(electionSample);

    // removes all but the first contest
    _.remove(election.contests, (c) => c.id !== 'president');

    // remove all but one candidate from first contest
    const skippedContest = election.contests[0] as CandidateContest;
    _.remove(skippedContest.candidates, (c) => c.partyId !== '0');

    const overvoteBallot = generateOvervoteBallot({
      election,
      precinctId,
    });
    expect(overvoteBallot).toBeNull();
  });
});
