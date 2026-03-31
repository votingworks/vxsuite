import { expect, test } from 'vitest';
import {
  hasPartialRegisteredVoterCounts,
  isPrecinctCount,
  isSplitCounts,
} from './registered_voter_counts';
import type {
  ElectionRegisteredVotersCounts,
  PrecinctRegisteredVotersCountEntry,
} from './registered_voter_counts';
import type { Precinct } from './election';

const p1: Precinct = { id: 'p1', name: 'Precinct 1', districtIds: [] };
const p2: Precinct = { id: 'p2', name: 'Precinct 2', districtIds: [] };
const pSplit: Precinct = {
  id: 'ps',
  name: 'Split Precinct',
  splits: [
    { id: 's1', name: 'Split 1', districtIds: [] },
    { id: 's2', name: 'Split 2', districtIds: [] },
  ],
};

test('isPrecinctCount', () => {
  const number: PrecinctRegisteredVotersCountEntry = 500;
  const splits: PrecinctRegisteredVotersCountEntry = { splits: { s1: 100 } };
  expect(isPrecinctCount(number)).toEqual(true);
  expect(isPrecinctCount(splits)).toEqual(false);
});

test('isSplitCounts', () => {
  const number: PrecinctRegisteredVotersCountEntry = 500;
  const splits: PrecinctRegisteredVotersCountEntry = { splits: { s1: 100 } };
  expect(isSplitCounts(splits)).toEqual(true);
  expect(isSplitCounts(number)).toEqual(false);
});

test('hasPartialRegisteredVoterCounts - no precincts', () => {
  expect(hasPartialRegisteredVoterCounts([], {})).toEqual(false);
});

test('hasPartialRegisteredVoterCounts - all non-split precincts have counts', () => {
  const counts: ElectionRegisteredVotersCounts = { p1: 100, p2: 200 };
  expect(hasPartialRegisteredVoterCounts([p1, p2], counts)).toEqual(false);
});

test('hasPartialRegisteredVoterCounts - no non-split precincts have counts', () => {
  expect(hasPartialRegisteredVoterCounts([p1, p2], {})).toEqual(false);
});

test('hasPartialRegisteredVoterCounts - some non-split precincts have counts', () => {
  const counts: ElectionRegisteredVotersCounts = { p1: 100 };
  expect(hasPartialRegisteredVoterCounts([p1, p2], counts)).toEqual(true);
});

test('hasPartialRegisteredVoterCounts - all splits have counts', () => {
  const counts: ElectionRegisteredVotersCounts = {
    ps: { splits: { s1: 100, s2: 200 } },
  };
  expect(hasPartialRegisteredVoterCounts([pSplit], counts)).toEqual(false);
});

test('hasPartialRegisteredVoterCounts - no splits have counts', () => {
  expect(hasPartialRegisteredVoterCounts([pSplit], {})).toEqual(false);
});

test('hasPartialRegisteredVoterCounts - some splits have counts', () => {
  const counts: ElectionRegisteredVotersCounts = {
    ps: { splits: { s1: 100 } },
  };
  expect(hasPartialRegisteredVoterCounts([pSplit], counts)).toEqual(true);
});

test('hasPartialRegisteredVoterCounts - split precinct entry present but no split counts', () => {
  // precinctEntry is defined but isSplitCounts branch has no matching splits
  const counts: ElectionRegisteredVotersCounts = {
    ps: 500 as unknown as ElectionRegisteredVotersCounts[string],
  };
  expect(hasPartialRegisteredVoterCounts([pSplit], counts)).toEqual(false);
});

test('hasPartialRegisteredVoterCounts - mixed non-split and split precincts, all have counts', () => {
  const counts: ElectionRegisteredVotersCounts = {
    p1: 100,
    ps: { splits: { s1: 100, s2: 200 } },
  };
  expect(hasPartialRegisteredVoterCounts([p1, pSplit], counts)).toEqual(false);
});

test('hasPartialRegisteredVoterCounts - mixed non-split and split precincts, partial counts', () => {
  // p1 has a count but pSplit splits do not
  const counts: ElectionRegisteredVotersCounts = { p1: 100 };
  expect(hasPartialRegisteredVoterCounts([p1, pSplit], counts)).toEqual(true);
});
