import { electionGeneral } from '@votingworks/fixtures';
import { CandidateContest } from '@votingworks/types';
import { rotateCandidates } from './candidate_rotation';

describe('rotateCandidates', () => {
  const candidateContest = electionGeneral.contests.find(
    (c): c is CandidateContest => c.type === 'candidate'
  )!;

  test('skips non-candidate contests', () => {
    const contest = electionGeneral.contests.find(
      (c) => c.type !== 'candidate'
    )!;
    expect(rotateCandidates(contest)).toEqual(contest);
  });

  test('skips contests with fewer than 2 candidates', () => {
    const contest: CandidateContest = {
      ...candidateContest,
      candidates: candidateContest.candidates.slice(0, 1),
    };
    expect(rotateCandidates(contest)).toEqual(contest);
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
    expect((rotateCandidates(contest) as CandidateContest).candidates).toEqual([
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

    expect((rotateCandidates(contest) as CandidateContest).candidates).toEqual([
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
});
