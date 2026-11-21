import { expect, test } from 'vitest';
import {
  ElectionRegisteredVoterCountsSchema,
  hasPartialRegisteredVoterCounts,
  isPrecinctCount,
  isSplitCounts,
  toTotalRegisteredVoterCounts,
  type ElectionRegisteredVoterCounts,
  type PrecinctRegisteredVoterCountEntry,
} from './registered_voter_counts.js';
import type { Precinct } from './election.js';

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
  const number: PrecinctRegisteredVoterCountEntry = 500;
  const splits: PrecinctRegisteredVoterCountEntry = { splits: { s1: 100 } };
  expect(isPrecinctCount(number)).toEqual(true);
  expect(isPrecinctCount(splits)).toEqual(false);
});

test('isSplitCounts', () => {
  const number: PrecinctRegisteredVoterCountEntry = 500;
  const splits: PrecinctRegisteredVoterCountEntry = { splits: { s1: 100 } };
  expect(isSplitCounts(splits)).toEqual(true);
  expect(isSplitCounts(number)).toEqual(false);
});

test('ElectionRegisteredVoterCountsSchema accepts valid counts', () => {
  const counts: ElectionRegisteredVoterCounts = {
    p1: { total: 40 },
    p2: { total: 0 },
    ps: { splits: { s1: { total: 35 }, s2: { total: 50 } } },
  };
  expect(ElectionRegisteredVoterCountsSchema.parse(counts)).toEqual(counts);
});

test('ElectionRegisteredVoterCountsSchema reads plain numbers as totals', () => {
  expect(
    ElectionRegisteredVoterCountsSchema.parse({
      p1: 100,
      ps: { splits: { s1: 200, s2: { total: 300 } } },
    })
  ).toEqual({
    p1: { total: 100 },
    ps: { splits: { s1: { total: 200 }, s2: { total: 300 } } },
  });
});

test('toTotalRegisteredVoterCounts', () => {
  expect(
    toTotalRegisteredVoterCounts({
      p1: { total: 500 },
      p2: { total: 100 },
      ps: { splits: { s1: { total: 500 }, s2: { total: 350 } } },
    })
  ).toEqual({ p1: 500, p2: 100, ps: { splits: { s1: 500, s2: 350 } } });
});

test('ElectionRegisteredVoterCountsSchema rejects invalid counts', () => {
  for (const invalid of [
    { p1: -1 },
    { p1: 1.5 },
    { p1: { total: -1 } },
    { p1: {} },
    { ps: { splits: { s1: { total: -1 } } } },
    { ps: { total: 10, splits: { s1: { total: 10 } } } },
    { ps: { total: 10, splits: { s1: 10 } } },
    { p1: { total: 10, extra: 1 } },
  ]) {
    expect(
      ElectionRegisteredVoterCountsSchema.safeParse(invalid).success
    ).toEqual(false);
  }
});

test('hasPartialRegisteredVoterCounts - no precincts', () => {
  expect(hasPartialRegisteredVoterCounts([], {})).toEqual(false);
});

test('hasPartialRegisteredVoterCounts - all non-split precincts have counts', () => {
  const counts: ElectionRegisteredVoterCounts = { p1: 100, p2: 200 };
  expect(hasPartialRegisteredVoterCounts([p1, p2], counts)).toEqual(false);
});

test('hasPartialRegisteredVoterCounts - no non-split precincts have counts', () => {
  expect(hasPartialRegisteredVoterCounts([p1, p2], {})).toEqual(false);
});

test('hasPartialRegisteredVoterCounts - some non-split precincts have counts', () => {
  const counts: ElectionRegisteredVoterCounts = { p1: 100 };
  expect(hasPartialRegisteredVoterCounts([p1, p2], counts)).toEqual(true);
});

test('hasPartialRegisteredVoterCounts - all splits have counts', () => {
  const counts: ElectionRegisteredVoterCounts = {
    ps: { splits: { s1: 100, s2: 200 } },
  };
  expect(hasPartialRegisteredVoterCounts([pSplit], counts)).toEqual(false);
});

test('hasPartialRegisteredVoterCounts - no splits have counts', () => {
  expect(hasPartialRegisteredVoterCounts([pSplit], {})).toEqual(false);
});

test('hasPartialRegisteredVoterCounts - some splits have counts', () => {
  const counts: ElectionRegisteredVoterCounts = {
    ps: { splits: { s1: 100 } },
  };
  expect(hasPartialRegisteredVoterCounts([pSplit], counts)).toEqual(true);
});

test('hasPartialRegisteredVoterCounts - split precinct entry present but no split counts', () => {
  // precinctEntry is defined but isSplitCounts branch has no matching splits
  const counts: ElectionRegisteredVoterCounts = {
    ps: 500,
  };
  expect(hasPartialRegisteredVoterCounts([pSplit], counts)).toEqual(false);
});

test('hasPartialRegisteredVoterCounts - mixed non-split and split precincts, all have counts', () => {
  const counts: ElectionRegisteredVoterCounts = {
    p1: 100,
    ps: { splits: { s1: 100, s2: 200 } },
  };
  expect(hasPartialRegisteredVoterCounts([p1, pSplit], counts)).toEqual(false);
});

test('hasPartialRegisteredVoterCounts - mixed non-split and split precincts, partial counts', () => {
  // p1 has a count but pSplit splits do not
  const counts: ElectionRegisteredVoterCounts = { p1: 100 };
  expect(hasPartialRegisteredVoterCounts([p1, pSplit], counts)).toEqual(true);
});

test('hasPartialRegisteredVoterCounts - non-split precinct with split counts', () => {
  const counts: ElectionRegisteredVoterCounts = {
    p1: { splits: { s1: { total: 100 } } },
    p2: { total: 100 },
  };
  expect(hasPartialRegisteredVoterCounts([p1, p2], counts)).toEqual(true);
});
