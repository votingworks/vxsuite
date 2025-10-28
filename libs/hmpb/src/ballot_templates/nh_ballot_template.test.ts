import { describe, expect, test } from 'vitest';
import {
  electionFamousNames2021Fixtures,
  readElectionGeneral,
} from '@votingworks/fixtures';
import { CandidateContest, YesNoContest } from '@votingworks/types';
import {
  rotateCandidatesByStatute,
  rotateCandidatesByPrecinct,
  getCandidateOrderingSetsForNhBallot,
} from './nh_ballot_template';
import { RotationParams } from '../types';

const electionGeneral = readElectionGeneral();
const electionFamousNames = electionFamousNames2021Fixtures.readElection();

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
      contest.candidates.map((c) => ({ id: c.id }))
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
    expect(rotateCandidatesByStatute(contest)).toEqual([
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
    expect(rotateCandidatesByStatute(contest)).toEqual([
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
    expect(rotateCandidatesByStatute(contest)).toEqual([
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
    expect(rotateCandidatesByStatute(contest)).toEqual([
      { id: '1' }, // Martha Jones
      { id: '3' }, // Larry Smith
      { id: '2' }, // John Zorro
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

  expect(
    rotateCandidatesByPrecinct(contest, election.precincts, precinct1.id)
  ).toEqual([
    { id: '1' }, // Martha Jones
    { id: '3' }, // Larry Smith
    { id: '2' }, // John Zorro
  ]);
  expect(
    rotateCandidatesByPrecinct(contest, election.precincts, precinct2.id)
  ).toEqual([
    { id: '3' }, // Larry Smith
    { id: '2' }, // John Zorro
    { id: '1' }, // Martha Jones
  ]);
  expect(
    rotateCandidatesByPrecinct(contest, election.precincts, precinct3.id)
  ).toEqual([
    { id: '2' }, // John Zorro
    { id: '1' }, // Martha Jones
    { id: '3' }, // Larry Smith
  ]);
  expect(
    rotateCandidatesByPrecinct(contest, election.precincts, precinct4.id)
  ).toEqual([
    { id: '1' }, // Martha Jones
    { id: '3' }, // Larry Smith
    { id: '2' }, // John Zorro
  ]);
});

describe('getCandidateOrderingSetsForNhBallot', () => {
  test('generates orderings with NH rotation for each precinct/split', () => {
    const [precinct1, precinct2] = electionFamousNames.precincts;

    const testCases = [
      {
        precinctsOrSplitIds: [
          { precinctId: precinct1.id },
          { precinctId: precinct2.id },
        ],
        expectedCount: 2,
      },
      {
        precinctsOrSplitIds: [
          { precinctId: precinct1.id, splitId: 'split-1' },
          { precinctId: precinct1.id, splitId: 'split-2' },
        ],
        expectedCount: 2,
      },
    ];

    for (const { precinctsOrSplitIds, expectedCount } of testCases) {
      const contest: CandidateContest = {
        ...electionFamousNames.contests[0],
        id: 'contest-1',
        type: 'candidate',
        districtId: 'district-1',
        title: 'Test Contest',
        seats: 1,
        allowWriteIns: false,
        candidates: [
          { id: '1', name: 'Martha Jones' },
          { id: '2', name: 'John Zorro' },
          { id: '3', name: 'Larry Smith' },
        ],
      };

      const params: RotationParams = {
        contests: [contest],
        precincts: electionFamousNames.precincts,
        precinctsOrSplitIds,
        districtIds: [contest.districtId],
        electionId: electionFamousNames.id,
      };

      const result = getCandidateOrderingSetsForNhBallot(params);

      expect(result).toHaveLength(expectedCount);
      expect(result[0].precinctsOrSplits).toEqual([precinctsOrSplitIds[0]]);
      // Verify NH rotation is applied (alphabetical by last name, then rotated)
      expect(result[0].orderedContests[contest.id].map((c) => c.id)).toEqual([
        '1', // Martha Jones
        '3', // Larry Smith
        '2', // John Zorro
      ]);
    }
  });

  test('filters contests by type and district', () => {
    const candidateContest: CandidateContest = {
      ...electionFamousNames.contests[0],
      id: 'contest-1',
      type: 'candidate',
      districtId: 'district-1',
      title: 'Test Contest',
      seats: 1,
      allowWriteIns: false,
      candidates: [{ id: '1', name: 'Alice' }],
    };

    const yesnoContest: YesNoContest = {
      id: 'yesno-1',
      type: 'yesno',
      districtId: 'district-1',
      title: 'Ballot Measure',
      description: 'Test measure',
      yesOption: { id: 'yes', label: 'Yes' },
      noOption: { id: 'no', label: 'No' },
    };

    const contestInDifferentDistrict: CandidateContest = {
      ...electionFamousNames.contests[0],
      id: 'contest-2',
      type: 'candidate',
      districtId: 'district-2',
      title: 'Test Contest 2',
      seats: 1,
      allowWriteIns: false,
      candidates: [{ id: '2', name: 'Bob' }],
    };

    const [precinct1] = electionFamousNames.precincts;

    const params: RotationParams = {
      contests: [candidateContest, yesnoContest, contestInDifferentDistrict],
      precincts: electionFamousNames.precincts,
      precinctsOrSplitIds: [{ precinctId: precinct1.id }],
      districtIds: ['district-1'],
      electionId: electionFamousNames.id,
    };

    const result = getCandidateOrderingSetsForNhBallot(params);

    expect(result).toHaveLength(1);
    expect(result[0].orderedContests).toHaveProperty('contest-1');
    expect(result[0].orderedContests).not.toHaveProperty('yesno-1');
    expect(result[0].orderedContests).not.toHaveProperty('contest-2');
  });
});
