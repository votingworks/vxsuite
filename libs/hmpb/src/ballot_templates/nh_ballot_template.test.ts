import { describe, expect, test } from 'vitest';
import {
  electionFamousNames2021Fixtures,
  readElectionGeneral,
} from '@votingworks/fixtures';
import { CandidateContest } from '@votingworks/types';
import {
  rotateCandidatesByStatute,
  rotateCandidatesByPrecinct,
} from './nh_ballot_template';

const electionGeneral = readElectionGeneral();

describe('rotateCandidatesByStatute', () => {
  const election = electionGeneral;
  const candidateContest = election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate'
  )!;

  test('skips contests with fewer than 2 candidates', () => {
    const contest: CandidateContest = {
      ...candidateContest,
      candidates: candidateContest.candidates.slice(0, 1),
    };
    expect(rotateCandidatesByStatute(contest)).toEqual(
      contest.candidates.map((c) => c.id)
    );
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
    expect(rotateCandidatesByStatute(contest)).toEqual([
      '1', // Martha Jones
      '3', // Larry Smith
      '2', // John Zorro
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
    expect(rotateCandidatesByStatute(contest)).toEqual([
      '3', // John Curtis
      '4', // Adam Dean
      '5', // Frank French
      '6', // Candy Lozenge
      '7', // Susan North
      '8', // Joseph Smith
      '9', // Jean Thompson
      '10', // John Zorro
      '1', // Jane Adams
      '2', // Bruce Brown
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
    expect(rotateCandidatesByStatute(contest)).toEqual([
      '3', // John Adams
      // 'del Rey' comes after 'Adams' but before 'Harding'
      '1', // Lana del Rey
      '2', // Warren Harding
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
    expect(rotateCandidatesByStatute(contest)).toEqual([
      '3', // John Adams
      // 'George' comes after 'Adams' but before 'Harding'
      '1', // George
      '2', // Warren Harding
    ]);
  });

  test('candidate rotation idempotency', () => {
    const contest: CandidateContest = {
      ...candidateContest,
      candidates: [
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
      ],
    };
    expect(rotateCandidatesByStatute(contest)).toEqual([
      '1', // Martha Jones
      '3', // Larry Smith
      '2', // John Zorro
    ]);
  });
});

test('rotateCandidatesByPrecinct rotates based on index of precinct within ballot style', () => {
  const election = electionFamousNames2021Fixtures.readElection();
  const candidateContest = election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate'
  )!;
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
  const [precinct1, precinct2, precinct3, precinct4] = election.precincts;

  expect(rotateCandidatesByPrecinct(contest, election, precinct1.id)).toEqual([
    '1', // Martha Jones
    '3', // Larry Smith
    '2', // John Zorro
  ]);
  expect(rotateCandidatesByPrecinct(contest, election, precinct2.id)).toEqual([
    '3', // Larry Smith
    '1', // Martha Jones
    '2', // John Zorro
  ]);
  expect(rotateCandidatesByPrecinct(contest, election, precinct3.id)).toEqual([
    '2', // John Zorro
    '1', // Martha Jones
    '3', // Larry Smith
  ]);
  expect(rotateCandidatesByPrecinct(contest, election, precinct4.id)).toEqual([
    '1', // Martha Jones
    '3', // Larry Smith
    '2', // John Zorro
  ]);
});
