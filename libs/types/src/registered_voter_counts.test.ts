import { expect, test } from 'vitest';
import {
  ElectionRegisteredVoterCountsSchema,
  hasPartialRegisteredVoterCounts,
  isPrecinctCount,
  isSplitCounts,
  listRegisteredVoterCounts,
  toTotalRegisteredVoterCounts,
  type ElectionRegisteredVoterCounts,
  type PrecinctRegisteredVoterCountEntry,
} from './registered_voter_counts.js';
import type { Precinct, PrecinctWithSplits } from './election.js';

const p1: Precinct = { id: 'p1', name: 'Precinct 1', districtIds: [] };
const p2: Precinct = { id: 'p2', name: 'Precinct 2', districtIds: [] };
const pSplit: PrecinctWithSplits = {
  id: 'ps',
  name: 'Split Precinct',
  splits: [
    { id: 's1', name: 'Split 1', districtIds: [] },
    { id: 's2', name: 'Split 2', districtIds: [] },
  ],
};

const totalOnly: PrecinctRegisteredVoterCountEntry = { total: 500 };
const byParty: PrecinctRegisteredVoterCountEntry = {
  total: 350,
  byParty: { DEM: 100, REP: 200 },
  nonpartisan: 50,
};
const splits: PrecinctRegisteredVoterCountEntry = {
  splits: { s1: { total: 100 } },
};

test('isPrecinctCount', () => {
  expect(isPrecinctCount(totalOnly)).toEqual(true);
  expect(isPrecinctCount(byParty)).toEqual(true);
  expect(isPrecinctCount(splits)).toEqual(false);
});

test('isSplitCounts', () => {
  expect(isSplitCounts(splits)).toEqual(true);
  expect(isSplitCounts(totalOnly)).toEqual(false);
  expect(isSplitCounts(byParty)).toEqual(false);
});

test('listRegisteredVoterCounts', () => {
  expect(
    listRegisteredVoterCounts([p1, p2, pSplit], {
      p1: { total: 100 },
      ps: { splits: { s2: { total: 200 } } },
    })
  ).toEqual([
    { precinctOrSplit: { precinct: p1 }, count: { total: 100 } },
    { precinctOrSplit: { precinct: p2 }, count: undefined },
    {
      precinctOrSplit: { precinct: pSplit, split: pSplit.splits[0] },
      count: undefined,
    },
    {
      precinctOrSplit: { precinct: pSplit, split: pSplit.splits[1] },
      count: { total: 200 },
    },
  ]);
});

test('ElectionRegisteredVoterCountsSchema accepts valid counts', () => {
  const counts: ElectionRegisteredVoterCounts = {
    p1: { total: 35, byParty: { DEM: 10, REP: 20 }, nonpartisan: 5 },
    p2: { total: 10, byParty: { DEM: 10 } },
    p3: { total: 40 },
    p4: { total: 0, byParty: {} },
    ps: {
      splits: {
        s1: { total: 35, byParty: { DEM: 10, REP: 20 }, nonpartisan: 5 },
        s2: { total: 50 },
      },
    },
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
      p1: { total: 500, byParty: { DEM: 300 }, nonpartisan: 200 },
      p2: { total: 100 },
      ps: {
        splits: {
          s1: { total: 500, byParty: { DEM: 500 } },
          s2: { total: 350 },
        },
      },
    })
  ).toEqual({ p1: 500, p2: 100, ps: { splits: { s1: 500, s2: 350 } } });
});

test('ElectionRegisteredVoterCountsSchema rejects invalid counts', () => {
  for (const invalid of [
    { p1: -1 },
    { p1: 1.5 },
    { p1: { total: -1 } },
    { p1: { byParty: { DEM: 10 } } },
    { p1: { total: 10, byParty: { DEM: -1 } } },
    { p1: { total: 10, byParty: { DEM: 10 }, nonpartisan: -1 } },
    { p1: { total: 5, nonpartisan: 5 } },
    { p1: { total: 30, byParty: { DEM: 10, REP: 10 } } },
    { p1: { total: 30, byParty: { DEM: 10, REP: 20 }, nonpartisan: 5 } },
    { ps: { splits: { s1: { total: 1, byParty: { DEM: 2 } } } } },
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
  const counts: ElectionRegisteredVoterCounts = {
    p1: { total: 100 },
    p2: { total: 200 },
  };
  expect(hasPartialRegisteredVoterCounts([p1, p2], counts)).toEqual(false);
});

test('hasPartialRegisteredVoterCounts - no non-split precincts have counts', () => {
  expect(hasPartialRegisteredVoterCounts([p1, p2], {})).toEqual(false);
});

test('hasPartialRegisteredVoterCounts - some non-split precincts have counts', () => {
  const counts: ElectionRegisteredVoterCounts = { p1: { total: 100 } };
  expect(hasPartialRegisteredVoterCounts([p1, p2], counts)).toEqual(true);
});

test('hasPartialRegisteredVoterCounts - all splits have counts', () => {
  const counts: ElectionRegisteredVoterCounts = {
    ps: { splits: { s1: { total: 100 }, s2: { total: 200 } } },
  };
  expect(hasPartialRegisteredVoterCounts([pSplit], counts)).toEqual(false);
});

test('hasPartialRegisteredVoterCounts - no splits have counts', () => {
  expect(hasPartialRegisteredVoterCounts([pSplit], {})).toEqual(false);
});

test('hasPartialRegisteredVoterCounts - some splits have counts', () => {
  const counts: ElectionRegisteredVoterCounts = {
    ps: { splits: { s1: { total: 100 } } },
  };
  expect(hasPartialRegisteredVoterCounts([pSplit], counts)).toEqual(true);
});

test('hasPartialRegisteredVoterCounts - split precinct entry present but no split counts', () => {
  // precinctEntry is defined but isSplitCounts branch has no matching splits
  const counts: ElectionRegisteredVoterCounts = {
    ps: { total: 500 },
  };
  expect(hasPartialRegisteredVoterCounts([pSplit], counts)).toEqual(false);
});

test('hasPartialRegisteredVoterCounts - mixed non-split and split precincts, all have counts', () => {
  const counts: ElectionRegisteredVoterCounts = {
    p1: { total: 100 },
    ps: { splits: { s1: { total: 100 }, s2: { total: 200 } } },
  };
  expect(hasPartialRegisteredVoterCounts([p1, pSplit], counts)).toEqual(false);
});

test('hasPartialRegisteredVoterCounts - mixed non-split and split precincts, partial counts', () => {
  // p1 has a count but pSplit splits do not
  const counts: ElectionRegisteredVoterCounts = { p1: { total: 100 } };
  expect(hasPartialRegisteredVoterCounts([p1, pSplit], counts)).toEqual(true);
});

test('hasPartialRegisteredVoterCounts - all precincts and splits have party breakdowns', () => {
  const counts: ElectionRegisteredVoterCounts = {
    p1: { total: 35, byParty: { DEM: 10, REP: 20 }, nonpartisan: 5 },
    ps: {
      splits: {
        s1: { total: 30, byParty: { DEM: 10, REP: 20 } },
        s2: { total: 30, byParty: { DEM: 10, REP: 20 } },
      },
    },
  };
  expect(hasPartialRegisteredVoterCounts([p1, pSplit], counts)).toEqual(false);
});

test('hasPartialRegisteredVoterCounts - all counts are totals', () => {
  const counts: ElectionRegisteredVoterCounts = {
    p1: { total: 100 },
    ps: { splits: { s1: { total: 30 }, s2: { total: 40 } } },
  };
  expect(hasPartialRegisteredVoterCounts([p1, pSplit], counts)).toEqual(false);
});

test('hasPartialRegisteredVoterCounts - some precincts have party breakdowns', () => {
  const counts: ElectionRegisteredVoterCounts = {
    p1: { total: 30, byParty: { DEM: 10, REP: 20 } },
  };
  expect(hasPartialRegisteredVoterCounts([p1, p2], counts)).toEqual(true);
});

test('hasPartialRegisteredVoterCounts - totals mixed with party breakdowns across precincts', () => {
  const counts: ElectionRegisteredVoterCounts = {
    p1: { total: 100 },
    p2: { total: 30, byParty: { DEM: 10, REP: 20 } },
  };
  expect(hasPartialRegisteredVoterCounts([p1, p2], counts)).toEqual(true);
});

test('hasPartialRegisteredVoterCounts - totals mixed with party breakdowns across splits', () => {
  const counts: ElectionRegisteredVoterCounts = {
    ps: {
      splits: {
        s1: { total: 100 },
        s2: { total: 30, byParty: { DEM: 10, REP: 20 } },
      },
    },
  };
  expect(hasPartialRegisteredVoterCounts([pSplit], counts)).toEqual(true);
});

test('hasPartialRegisteredVoterCounts - non-split precinct with split counts', () => {
  const counts: ElectionRegisteredVoterCounts = {
    p1: { splits: { s1: { total: 100 } } },
    p2: { total: 100 },
  };
  expect(hasPartialRegisteredVoterCounts([p1, p2], counts)).toEqual(true);
});
