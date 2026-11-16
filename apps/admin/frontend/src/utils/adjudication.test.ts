import { expect, test } from 'vitest';
import type { AdjudicatedCvrContest } from '@votingworks/admin-backend';
import {
  type AdjudicatedContests,
  normalizeWriteInName,
  writeInNamesFromOtherContests,
} from './adjudication.js';

test('normalizeWriteInName', () => {
  expect(normalizeWriteInName('Name')).toEqual('name');
  expect(normalizeWriteInName('  Name  ')).toEqual('name');
  expect(normalizeWriteInName('  Na     me  ')).toEqual('na me');
});

test('writeInNamesFromOtherContests', () => {
  const contests: AdjudicatedCvrContest[] = [
    {
      contestId: 'zoo-council-mammal',
      adjudicatedContestOptionById: {
        zebra: { type: 'official-option', hasVote: true },
        'write-in-0': {
          type: 'write-in-option',
          candidateType: 'write-in-candidate',
          hasVote: true,
          candidateName: 'Joe Schmo',
        },
        'write-in-1': { type: 'write-in-option', hasVote: false },
      },
    },
    {
      contestId: 'aquarium-council-fish',
      adjudicatedContestOptionById: {
        'write-in-0': {
          type: 'write-in-option',
          candidateType: 'write-in-candidate',
          hasVote: true,
          candidateName: 'joe  schmo ',
        },
        'write-in-1': {
          type: 'write-in-option',
          candidateType: 'official-candidate',
          hasVote: true,
          candidateId: 'pufferfish',
        },
      },
    },
  ];
  const adjudicatedContests: AdjudicatedContests = new Map(
    contests.map((c) => [c.contestId, c])
  );

  expect(writeInNamesFromOtherContests(adjudicatedContests, 'fishing')).toEqual(
    ['Joe Schmo']
  );
  expect(
    writeInNamesFromOtherContests(adjudicatedContests, 'zoo-council-mammal')
  ).toEqual(['joe  schmo ']);
  expect(
    writeInNamesFromOtherContests(adjudicatedContests, 'aquarium-council-fish')
  ).toEqual(['Joe Schmo']);
});
