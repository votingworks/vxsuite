import { describe, expect, test } from 'vitest';
import { readElectionGeneral } from '@votingworks/fixtures';
import { CandidateContest } from '@votingworks/types';
import { rotateCandidates } from './candidate_rotation';

const electionGeneral = readElectionGeneral();

describe('rotateCandidates', () => {
  const candidateContest = electionGeneral.contests.find(
    (c): c is CandidateContest => c.type === 'candidate'
  )!;

  test('skips non-candidate contests', () => {
    const contest = electionGeneral.contests.find(
      (c) => c.type !== 'candidate'
    )!;
    expect(rotateCandidates(contest, 'NhBallot')).toEqual(contest);
  });

  test('skips contests with fewer than 2 candidates', () => {
    const contest: CandidateContest = {
      ...candidateContest,
      candidates: candidateContest.candidates.slice(0, 1),
    };
    expect(rotateCandidates(contest, 'NhBallot')).toEqual(contest);
  });

  // Examples drawn from NH-provided documentation
  test('rotates candidates according to NH rules for 3-candidate contest', () => {
    const contest: CandidateContest = {
      ...candidateContest,
      candidates: [
        {
          id: '1',
          name: 'Martha Jones',
        },
        {
          id: '2',
          name: 'John Zorro',
        },
        {
          id: '3',
          name: 'Larry Smith',
        },
      ],
    };
    expect(
      (rotateCandidates(contest, 'NhBallot') as CandidateContest).candidates
    ).toEqual([
      {
        id: '1',
        name: 'Martha Jones',
      },
      {
        id: '3',
        name: 'Larry Smith',
      },
      {
        id: '2',
        name: 'John Zorro',
      },
    ]);
    expect(
      (rotateCandidates(contest, 'NhBallotV3') as CandidateContest).candidates
    ).toEqual([
      {
        id: '1',
        name: 'Martha Jones',
      },
      {
        id: '3',
        name: 'Larry Smith',
      },
      {
        id: '2',
        name: 'John Zorro',
      },
    ]);
    expect(
      (rotateCandidates(contest, 'VxDefaultBallot') as CandidateContest)
        .candidates
    ).toEqual([
      {
        id: '1',
        name: 'Martha Jones',
      },
      {
        id: '2',
        name: 'John Zorro',
      },
      {
        id: '3',
        name: 'Larry Smith',
      },
    ]);
  });

  test('rotates candidates according to NH rules for 10-candidate contest', () => {
    const contest: CandidateContest = {
      ...candidateContest,
      candidates: [
        {
          id: '1',
          name: 'Jane Adams',
        },
        {
          id: '3',
          name: 'John Curtis',
        },
        {
          id: '2',
          name: 'Bruce Brown',
        },
        {
          id: '4',
          name: 'Adam Dean',
        },
        {
          id: '5',
          name: 'Frank French',
        },
        {
          id: '7',
          name: 'Susan North',
        },
        {
          id: '8',
          name: 'Joseph Smith',
        },
        {
          id: '9',
          name: 'Jean Thompson',
        },
        {
          id: '10',
          name: 'John Zorro',
        },
        {
          id: '6',
          name: 'Candy Lozenge',
        },
      ],
    };

    expect(
      (rotateCandidates(contest, 'NhBallot') as CandidateContest).candidates
    ).toEqual([
      {
        id: '3',
        name: 'John Curtis',
      },
      {
        id: '4',
        name: 'Adam Dean',
      },
      {
        id: '5',
        name: 'Frank French',
      },
      {
        id: '6',
        name: 'Candy Lozenge',
      },
      {
        id: '7',
        name: 'Susan North',
      },
      {
        id: '8',
        name: 'Joseph Smith',
      },
      {
        id: '9',
        name: 'Jean Thompson',
      },
      {
        id: '10',
        name: 'John Zorro',
      },
      {
        id: '1',
        name: 'Jane Adams',
      },
      {
        id: '2',
        name: 'Bruce Brown',
      },
    ]);
  });

  test('rotates candidates according to structured last name data', () => {
    const contest: CandidateContest = {
      ...candidateContest,
      candidates: [
        {
          id: '1',
          name: 'Lana del Rey',
          firstName: 'Lana',
          lastName: 'del Rey',
        },
        {
          id: '2',
          name: 'Warren Harding',
          firstName: 'Warren',
          lastName: 'Harding',
        },
        {
          id: '3',
          name: 'John Adams',
          firstName: 'John',
          lastName: 'Adams',
        },
      ],
    };
    expect(
      (rotateCandidates(contest, 'NhBallot') as CandidateContest).candidates
    ).toEqual([
      {
        id: '3',
        name: 'John Adams',
        firstName: 'John',
        lastName: 'Adams',
      },
      // 'del Rey' comes after 'Adams' but before 'Harding'
      {
        id: '1',
        name: 'Lana del Rey',
        firstName: 'Lana',
        lastName: 'del Rey',
      },
      {
        id: '2',
        name: 'Warren Harding',
        firstName: 'Warren',
        lastName: 'Harding',
      },
    ]);
  });

  test('rotates by first name if last name is not present', () => {
    const contest: CandidateContest = {
      ...candidateContest,
      candidates: [
        {
          id: '1',
          name: 'George',
          firstName: 'George',
        },
        {
          id: '2',
          name: 'Warren Harding',
          firstName: 'Warren',
          lastName: 'Harding',
        },
        {
          id: '3',
          name: 'John Adams',
          firstName: 'John',
          lastName: 'Adams',
        },
      ],
    };
    expect(
      (rotateCandidates(contest, 'NhBallot') as CandidateContest).candidates
    ).toEqual([
      {
        id: '3',
        name: 'John Adams',
        firstName: 'John',
        lastName: 'Adams',
      },
      // 'George' comes after 'Adams' but before 'Harding'
      {
        id: '1',
        name: 'George',
        firstName: 'George',
      },
      {
        id: '2',
        name: 'Warren Harding',
        firstName: 'Warren',
        lastName: 'Harding',
      },
    ]);
  });
});
