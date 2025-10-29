import { describe, expect, test } from 'vitest';
import { readElectionGeneral } from '@votingworks/fixtures';
import { CandidateContest, YesNoContest, Precinct } from '@votingworks/types';
import {
  getCandidateOrderingByPrecinctAlphabetical,
  getAllPossibleCandidateOrderings,
  deduplicateIdenticalOrderingsAcrossPrecincts,
} from './ballot_rotation';
import { RotationParams, CandidateOrdering } from './types';

const electionGeneral = readElectionGeneral();

describe('getCandidateOrderingByPrecinctAlphabetical', () => {
  test('rotates candidates based on precinct first letter', () => {
    const candidateContest = electionGeneral.contests.find(
      (c): c is CandidateContest => c.type === 'candidate'
    )!;

    const testCases = [
      {
        precinctName: 'Anderson',
        expected: ['1', '2', '3', '4'], // A, B, C, D
      },
      {
        precinctName: 'Central',
        expected: ['3', '4', '1', '2'], // C, D, A, B
      },
      {
        precinctName: 'central', // lowercase
        expected: ['3', '4', '1', '2'], // C, D, A, B
      },
    ];

    for (const { precinctName, expected } of testCases) {
      const contest: CandidateContest = {
        ...candidateContest,
        candidates: [
          { id: '1', name: 'Alice Johnson' },
          { id: '2', name: 'Bob Smith' },
          { id: '3', name: 'Charlie Brown' },
          { id: '4', name: 'Diana Prince' },
        ],
      };

      const precinct: Precinct = {
        id: 'precinct-1',
        name: precinctName,
        districtIds: [contest.districtId],
      };

      const params: RotationParams = {
        contests: [contest],
        precincts: [precinct],
        precinctsOrSplitIds: [{ precinctId: precinct.id }],
        districtIds: [contest.districtId],
        electionId: 'test-election',
      };

      const result = getCandidateOrderingByPrecinctAlphabetical(params);
      expect(
        result[0].orderedCandidatesByContest[contest.id].map((c) => c.id)
      ).toEqual(expected);
    }
  });

  test('generates separate orderings for multiple precincts and handles splits', () => {
    const candidateContest = electionGeneral.contests.find(
      (c): c is CandidateContest => c.type === 'candidate'
    )!;
    const contest: CandidateContest = {
      ...candidateContest,
      candidates: [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ],
    };

    const precinct1: Precinct = {
      id: 'precinct-1',
      name: 'Anderson',
      districtIds: [contest.districtId],
    };

    const precinct2: Precinct = {
      id: 'precinct-2',
      name: 'Baker',
      districtIds: [contest.districtId],
    };

    const params: RotationParams = {
      contests: [contest],
      precincts: [precinct1, precinct2],
      precinctsOrSplitIds: [
        { precinctId: precinct1.id },
        { precinctId: precinct1.id, splitId: 'split-1' },
        { precinctId: precinct2.id },
      ],
      districtIds: [contest.districtId],
      electionId: 'test-election',
    };

    const result = getCandidateOrderingByPrecinctAlphabetical(params);

    expect(result).toHaveLength(3);
    expect(result[0].precinctsOrSplits).toEqual([{ precinctId: precinct1.id }]);
    expect(result[1].precinctsOrSplits).toEqual([
      { precinctId: precinct1.id, splitId: 'split-1' },
    ]);
    expect(result[2].precinctsOrSplits).toEqual([{ precinctId: precinct2.id }]);
  });

  test('skips yesno contests', () => {
    const candidateContest1 = electionGeneral.contests.find(
      (c): c is CandidateContest => c.type === 'candidate'
    )!;
    const yesnoContest = electionGeneral.contests.find(
      (c): c is YesNoContest => c.type === 'yesno'
    )!;

    const contest1: CandidateContest = {
      ...candidateContest1,
      id: 'contest-1',
      districtId: 'district-1',
      candidates: [{ id: '1', name: 'Alice' }],
    };

    const precinct: Precinct = {
      id: 'precinct-1',
      name: 'Anderson',
      districtIds: ['district-1'],
    };

    const params: RotationParams = {
      contests: [contest1, yesnoContest],
      precincts: [precinct],
      precinctsOrSplitIds: [{ precinctId: precinct.id }],
      districtIds: ['district-1'],
      electionId: 'test-election',
    };

    const result = getCandidateOrderingByPrecinctAlphabetical(params);

    expect(result).toHaveLength(1);
    expect(result[0].orderedCandidatesByContest).toHaveProperty('contest-1');
    expect(result[0].orderedCandidatesByContest).not.toHaveProperty(
      'contest-2'
    );
    expect(result[0].orderedCandidatesByContest).not.toHaveProperty(
      yesnoContest.id
    );
  });
});

describe('getAllPossibleCandidateOrderings', () => {
  test('returns correct orderings for different ballot templates', () => {
    const candidateContest = electionGeneral.contests.find(
      (c): c is CandidateContest => c.type === 'candidate'
    )!;

    const testCases: Array<{
      template: 'VxDefaultBallot' | 'NhBallot';
      candidates: Array<{ id: string; name: string }>;
      expectedOrderIds: string[];
    }> = [
      {
        template: 'VxDefaultBallot',
        candidates: [
          { id: '1', name: 'Charlie Brown' },
          { id: '2', name: 'Alice Johnson' },
          { id: '3', name: 'Bob Smith' },
        ],
        expectedOrderIds: ['1', '2', '3'], // Original order preserved
      },
      {
        template: 'NhBallot',
        candidates: [
          { id: '1', name: 'Martha Jones' },
          { id: '2', name: 'John Zorro' },
          { id: '3', name: 'Larry Smith' },
        ],
        expectedOrderIds: ['1', '3', '2'], // NH rotation applied
      },
    ];

    for (const { template, candidates, expectedOrderIds } of testCases) {
      const contest: CandidateContest = {
        ...candidateContest,
        candidates,
      };

      const precinct: Precinct = {
        id: 'precinct-1',
        name: 'Anderson',
        districtIds: [contest.districtId],
      };

      const params: RotationParams = {
        contests: [contest],
        precincts: [precinct],
        precinctsOrSplitIds: [{ precinctId: precinct.id }],
        districtIds: [contest.districtId],
        electionId: 'test-election',
      };

      const result = getAllPossibleCandidateOrderings(template, params);

      expect(result).toHaveLength(1);
      expect(
        result[0].orderedCandidatesByContest[contest.id].map((c) => c.id)
      ).toEqual(expectedOrderIds);
    }
  });

  test('deduplicates identical orderings across precincts and splits', () => {
    const candidateContest = electionGeneral.contests.find(
      (c): c is CandidateContest => c.type === 'candidate'
    )!;
    const contest: CandidateContest = {
      ...candidateContest,
      candidates: [
        { id: '1', name: 'Alice Johnson' },
        { id: '2', name: 'Bob Smith' },
      ],
    };

    const testCases = [
      {
        precinctsOrSplitIds: [
          { precinctId: 'precinct-1' },
          { precinctId: 'precinct-2' },
          { precinctId: 'precinct-3' },
        ],
        expectedCount: 1,
        expectedPrecinctCount: 3,
      },
      {
        precinctsOrSplitIds: [
          { precinctId: 'precinct-1', splitId: 'split-1' },
          { precinctId: 'precinct-1', splitId: 'split-2' },
        ],
        expectedCount: 1,
        expectedPrecinctCount: 2,
      },
    ];

    for (const {
      precinctsOrSplitIds,
      expectedCount,
      expectedPrecinctCount,
    } of testCases) {
      const precincts: Precinct[] = [
        {
          id: 'precinct-1',
          name: 'Anderson',
          districtIds: [contest.districtId],
        },
        {
          id: 'precinct-2',
          name: 'Arlington',
          districtIds: [contest.districtId],
        },
        { id: 'precinct-3', name: 'Baker', districtIds: [contest.districtId] },
      ];

      const params: RotationParams = {
        contests: [contest],
        precincts,
        precinctsOrSplitIds,
        districtIds: [contest.districtId],
        electionId: 'test-election',
      };

      const result = getAllPossibleCandidateOrderings('NhBallot', params);

      expect(result).toHaveLength(expectedCount);
      expect(result[0].precinctsOrSplits).toHaveLength(expectedPrecinctCount);
    }
  });

  test('handles multiple contests and empty lists', () => {
    const candidateContest1 = electionGeneral.contests.find(
      (c): c is CandidateContest => c.type === 'candidate'
    )!;
    const candidateContest2 = electionGeneral.contests.find(
      (c): c is CandidateContest =>
        c.type === 'candidate' && c.id !== candidateContest1.id
    )!;

    const testCases = [
      {
        contests: [
          {
            ...candidateContest1,
            id: 'contest-1',
            candidates: [{ id: '1', name: 'Alice' }],
          },
          {
            ...candidateContest2,
            id: 'contest-2',
            candidates: [{ id: '2', name: 'Bob' }],
          },
        ],
        expectedContestIds: ['contest-1', 'contest-2'],
      },
      {
        contests: [],
        expectedContestIds: [],
      },
    ];

    for (const { contests, expectedContestIds } of testCases) {
      const precinct: Precinct = {
        id: 'precinct-1',
        name: 'Anderson',
        districtIds: contests.map((c) => c.districtId),
      };

      const params: RotationParams = {
        contests,
        precincts: [precinct],
        precinctsOrSplitIds: [{ precinctId: precinct.id }],
        districtIds: contests.map((c) => c.districtId),
        electionId: 'test-election',
      };

      const result = getAllPossibleCandidateOrderings(
        'VxDefaultBallot',
        params
      );

      expect(result).toHaveLength(1);
      expect(Object.keys(result[0].orderedCandidatesByContest)).toEqual(
        expectedContestIds
      );
    }
  });
});

describe('deduplicateIdenticalOrderingsAcrossPrecincts', () => {
  test('combines precincts with identical orderings', () => {
    const orderings: CandidateOrdering[] = [
      {
        precinctsOrSplits: [{ precinctId: 'precinct-1' }],
        orderedCandidatesByContest: {
          'contest-1': [{ id: 'candidate-1' }, { id: 'candidate-2' }],
        },
      },
      {
        precinctsOrSplits: [{ precinctId: 'precinct-2' }],
        orderedCandidatesByContest: {
          'contest-1': [{ id: 'candidate-1' }, { id: 'candidate-2' }],
        },
      },
      {
        precinctsOrSplits: [{ precinctId: 'precinct-3' }],
        orderedCandidatesByContest: {
          'contest-1': [{ id: 'candidate-1' }, { id: 'candidate-2' }],
        },
      },
    ];

    const result = deduplicateIdenticalOrderingsAcrossPrecincts(orderings);

    expect(result).toHaveLength(1);
    expect(result[0].precinctsOrSplits).toHaveLength(3);
    expect(result[0].precinctsOrSplits).toContainEqual({
      precinctId: 'precinct-1',
    });
    expect(result[0].precinctsOrSplits).toContainEqual({
      precinctId: 'precinct-2',
    });
    expect(result[0].precinctsOrSplits).toContainEqual({
      precinctId: 'precinct-3',
    });
    expect(result[0].orderedCandidatesByContest).toEqual({
      'contest-1': [{ id: 'candidate-1' }, { id: 'candidate-2' }],
    });
  });

  test('preserves different orderings separately', () => {
    const orderings: CandidateOrdering[] = [
      {
        precinctsOrSplits: [{ precinctId: 'precinct-1' }],
        orderedCandidatesByContest: {
          'contest-1': [{ id: 'candidate-1' }, { id: 'candidate-2' }],
        },
      },
      {
        precinctsOrSplits: [{ precinctId: 'precinct-2' }],
        orderedCandidatesByContest: {
          'contest-1': [{ id: 'candidate-2' }, { id: 'candidate-1' }],
        },
      },
    ];

    const result = deduplicateIdenticalOrderingsAcrossPrecincts(orderings);

    expect(result).toHaveLength(2);
    expect(result[0].precinctsOrSplits).toEqual([{ precinctId: 'precinct-1' }]);
    expect(result[0].orderedCandidatesByContest).toEqual({
      'contest-1': [{ id: 'candidate-1' }, { id: 'candidate-2' }],
    });
    expect(result[1].precinctsOrSplits).toEqual([{ precinctId: 'precinct-2' }]);
    expect(result[1].orderedCandidatesByContest).toEqual({
      'contest-1': [{ id: 'candidate-2' }, { id: 'candidate-1' }],
    });
  });

  test('handles precinct splits correctly', () => {
    const orderings: CandidateOrdering[] = [
      {
        precinctsOrSplits: [{ precinctId: 'precinct-1', splitId: 'split-1' }],
        orderedCandidatesByContest: {
          'contest-1': [{ id: 'candidate-1' }, { id: 'candidate-2' }],
        },
      },
      {
        precinctsOrSplits: [{ precinctId: 'precinct-1', splitId: 'split-2' }],
        orderedCandidatesByContest: {
          'contest-1': [{ id: 'candidate-1' }, { id: 'candidate-2' }],
        },
      },
      {
        precinctsOrSplits: [{ precinctId: 'precinct-2' }],
        orderedCandidatesByContest: {
          'contest-1': [{ id: 'candidate-1' }, { id: 'candidate-2' }],
        },
      },
    ];

    const result = deduplicateIdenticalOrderingsAcrossPrecincts(orderings);

    expect(result).toHaveLength(1);
    expect(result[0].precinctsOrSplits).toHaveLength(3);
    expect(result[0].precinctsOrSplits).toContainEqual({
      precinctId: 'precinct-1',
      splitId: 'split-1',
    });
    expect(result[0].precinctsOrSplits).toContainEqual({
      precinctId: 'precinct-1',
      splitId: 'split-2',
    });
    expect(result[0].precinctsOrSplits).toContainEqual({
      precinctId: 'precinct-2',
    });
  });

  test('deduplicates precincts within combined groups', () => {
    const orderings: CandidateOrdering[] = [
      {
        precinctsOrSplits: [
          { precinctId: 'precinct-1' },
          { precinctId: 'precinct-2' },
        ],
        orderedCandidatesByContest: {
          'contest-1': [{ id: 'candidate-1' }],
        },
      },
      {
        precinctsOrSplits: [
          { precinctId: 'precinct-2' }, // duplicate
          { precinctId: 'precinct-3' },
        ],
        orderedCandidatesByContest: {
          'contest-1': [{ id: 'candidate-1' }],
        },
      },
    ];

    const result = deduplicateIdenticalOrderingsAcrossPrecincts(orderings);

    expect(result).toHaveLength(1);
    expect(result[0].precinctsOrSplits).toHaveLength(3);
    expect(result[0].precinctsOrSplits).toContainEqual({
      precinctId: 'precinct-1',
    });
    expect(result[0].precinctsOrSplits).toContainEqual({
      precinctId: 'precinct-2',
    });
    expect(result[0].precinctsOrSplits).toContainEqual({
      precinctId: 'precinct-3',
    });
  });

  test('handles multiple contests in ordering', () => {
    const orderings: CandidateOrdering[] = [
      {
        precinctsOrSplits: [{ precinctId: 'precinct-1' }],
        orderedCandidatesByContest: {
          'contest-1': [{ id: 'candidate-1' }],
          'contest-2': [{ id: 'candidate-2' }],
        },
      },
      {
        precinctsOrSplits: [{ precinctId: 'precinct-2' }],
        orderedCandidatesByContest: {
          'contest-1': [{ id: 'candidate-1' }],
          'contest-2': [{ id: 'candidate-2' }],
        },
      },
    ];

    const result = deduplicateIdenticalOrderingsAcrossPrecincts(orderings);

    expect(result).toHaveLength(1);
    expect(result[0].precinctsOrSplits).toHaveLength(2);
    expect(result[0].orderedCandidatesByContest).toEqual({
      'contest-1': [{ id: 'candidate-1' }],
      'contest-2': [{ id: 'candidate-2' }],
    });
  });

  test('handles empty orderings', () => {
    const orderings: CandidateOrdering[] = [];
    const result = deduplicateIdenticalOrderingsAcrossPrecincts(orderings);
    expect(result).toEqual([]);
  });
});
