import { electionSample } from '@votingworks/fixtures';
import { CandidateContest, Election } from '@votingworks/types';
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
