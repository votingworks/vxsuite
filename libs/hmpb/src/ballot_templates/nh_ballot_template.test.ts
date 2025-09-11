import { describe, expect, test } from 'vitest';
import { readElectionGeneral } from '@votingworks/fixtures';
import { CandidateContest } from '@votingworks/types';
import { rotateCandidates } from './nh_ballot_template';

const electionGeneral = readElectionGeneral();

describe('rotateCandidates - statute', () => {
  const election = electionGeneral;
  const precinctId = election.precincts[0].id;
  const candidateContest = election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate'
  )!;

  test('skips contests with fewer than 2 candidates', () => {
    const contest: CandidateContest = {
      ...candidateContest,
      candidates: candidateContest.candidates.slice(0, 1),
    };
    expect(rotateCandidates(contest, election, precinctId, 'statute')).toEqual(
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
    expect(rotateCandidates(contest, election, precinctId, 'statute')).toEqual([
      { id: '1' }, // Martha Jones
      { id: '3' }, // Larry Smith
      { id: '2' }, // John Zorro
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
    expect(rotateCandidates(contest, election, precinctId, 'statute')).toEqual([
      { id: '3' }, // John Curtis
      { id: '4' }, // Adam Dean
      { id: '5' }, // Frank French
      { id: '6' }, // Candy Lozenge
      { id: '7' }, // Susan North
      { id: '8' }, // Joseph Smith
      { id: '9' }, // Jean Thompson
      { id: '10' }, // John Zorro
      { id: '1' }, // Jane Adams
      { id: '2' }, // Bruce Brown
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
    expect(rotateCandidates(contest, election, precinctId, 'statute')).toEqual([
      { id: '3' }, // John Adams
      // 'del Rey' comes after 'Adams' but before 'Harding'
      { id: '1' }, // Lana del Rey
      { id: '2' }, // Warren Harding
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
    expect(rotateCandidates(contest, election, precinctId, 'statute')).toEqual([
      { id: '3' }, // John Adams
      // 'George' comes after 'Adams' but before 'Harding'
      { id: '1' }, // George
      { id: '2' }, // Warren Harding
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
    expect(rotateCandidates(contest, election, precinctId, 'statute')).toEqual([
      { id: '1' }, // Martha Jones
      { id: '3' }, // Larry Smith
      { id: '2' }, // John Zorro
    ]);
  });
});

describe('rotateCandidates - precinct', () => {
  // TODO
});
