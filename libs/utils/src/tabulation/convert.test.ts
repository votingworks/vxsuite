import { expect, test } from 'vitest';
import {
  convertVotesDictToTabulationVotes,
  filterVotesByContestIds,
} from './convert';

test('convertVotesDictToTabulationVotes', () => {
  expect(
    convertVotesDictToTabulationVotes({
      fishing: ['yes'],
      'best-animal-mammal': ['zebra'],
      'zoo-council-mammal': [
        {
          id: 'horse',
          name: 'Horse',
          isWriteIn: false,
        },
      ],
      'new-zoo-either': [],
    })
  ).toEqual({
    fishing: ['yes'],
    'best-animal-mammal': ['zebra'],
    'zoo-council-mammal': ['horse'],
    'new-zoo-either': [],
  });
});

test('filterVotesByContestIds', () => {
  expect(
    filterVotesByContestIds({
      votes: { 'contest-1': ['yes'], 'contest-2': ['no'] },
      contestIds: ['contest-1'],
    })
  ).toEqual({ 'contest-1': ['yes'] });
});
