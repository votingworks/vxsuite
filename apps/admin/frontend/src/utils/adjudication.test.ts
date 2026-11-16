import { expect, test } from 'vitest';
import type {
  AdjudicatedCvrContest,
  WriteInCandidateRecord,
} from '@votingworks/admin-backend';
import {
  type AdjudicatedContests,
  normalizeWriteInName,
  newWriteInNamesFromOtherContests,
} from './adjudication.js';

test('normalizeWriteInName', () => {
  expect(normalizeWriteInName('Name')).toEqual('name');
  expect(normalizeWriteInName('  Name  ')).toEqual('name');
  expect(normalizeWriteInName('  Na     me  ')).toEqual('na me');
});

test('newWriteInNamesFromOtherContests', () => {
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
        'write-in-1': {
          type: 'write-in-option',
          candidateType: 'write-in-candidate',
          hasVote: true,
          candidateName: 'John Doe',
        },
        'write-in-2': { type: 'write-in-option', hasVote: false },
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
  const existingWriteInCandidates: WriteInCandidateRecord[] = [
    {
      id: 'wic-1',
      electionId: 'e',
      contestId: 'zoo-council-mammal',
      name: 'John Doe',
    },
    {
      id: 'wic-2',
      electionId: 'e',
      contestId: 'aquarium-council-fish',
      name: 'Joe Schmo',
    },
  ];

  expect(
    newWriteInNamesFromOtherContests(
      adjudicatedContests,
      existingWriteInCandidates,
      'fishing'
    )
  ).toEqual(['Joe Schmo']);
  expect(
    newWriteInNamesFromOtherContests(
      adjudicatedContests,
      existingWriteInCandidates,
      'aquarium-council-fish'
    )
  ).toEqual(['Joe Schmo']);
  expect(
    newWriteInNamesFromOtherContests(
      adjudicatedContests,
      existingWriteInCandidates,
      'zoo-council-mammal'
    )
  ).toEqual(['joe  schmo ']);
  expect(
    newWriteInNamesFromOtherContests(adjudicatedContests, [], 'fishing')
  ).toEqual(['Joe Schmo', 'John Doe']);
});
