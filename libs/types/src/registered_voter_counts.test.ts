import { expect, test } from 'vitest';
import {
  ElectionRegisteredVoterCountsSchema,
  getPartyRegisteredVoterCounts,
  getTotalRegisteredVoterCount,
  hasPartialRegisteredVoterCounts,
  isPrecinctCount,
  isSplitCounts,
  listRegisteredVoterCounts,
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

const number: PrecinctRegisteredVoterCountEntry = 500;
const totalOnly: PrecinctRegisteredVoterCountEntry = { total: 500 };
const byParty: PrecinctRegisteredVoterCountEntry = {
  total: 350,
  byParty: { DEM: 100, REP: 200 },
  nonpartisan: 50,
};
const splits: PrecinctRegisteredVoterCountEntry = { splits: { s1: 100 } };

test('isPrecinctCount', () => {
  expect(isPrecinctCount(number)).toEqual(true);
  expect(isPrecinctCount(totalOnly)).toEqual(true);
  expect(isPrecinctCount(byParty)).toEqual(true);
  expect(isPrecinctCount(splits)).toEqual(false);
});

test('isSplitCounts', () => {
  expect(isSplitCounts(splits)).toEqual(true);
  expect(isSplitCounts(number)).toEqual(false);
  expect(isSplitCounts(totalOnly)).toEqual(false);
  expect(isSplitCounts(byParty)).toEqual(false);
});

test('getTotalRegisteredVoterCount', () => {
  expect(getTotalRegisteredVoterCount(500)).toEqual(500);
  expect(getTotalRegisteredVoterCount({ total: 500 })).toEqual(500);
  expect(
    getTotalRegisteredVoterCount({
      total: 350,
      byParty: { DEM: 100, REP: 200 },
      nonpartisan: 50,
    })
  ).toEqual(350);
});

test('getPartyRegisteredVoterCounts', () => {
  expect(getPartyRegisteredVoterCounts(500)).toBeUndefined();
  expect(getPartyRegisteredVoterCounts({ total: 500 })).toBeUndefined();
  expect(
    getPartyRegisteredVoterCounts({
      total: 300,
      byParty: { DEM: 100, REP: 200 },
    })
  ).toEqual({ DEM: 100, REP: 200 });
});

test('listRegisteredVoterCounts', () => {
  expect(
    listRegisteredVoterCounts([p1, p2, pSplit], {
      p1: 100,
      ps: { splits: { s2: { total: 200 } } },
    })
  ).toEqual([
    { precinctOrSplit: { precinct: p1 }, count: 100 },
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
    p1: 100,
    p2: { total: 35, byParty: { DEM: 10, REP: 20 }, nonpartisan: 5 },
    p3: { total: 10, byParty: { DEM: 10 } },
    p4: { total: 40 },
    p5: { total: 0, byParty: {} },
    ps: {
      splits: {
        s1: 100,
        s2: { total: 35, byParty: { DEM: 10, REP: 20 }, nonpartisan: 5 },
        s3: { total: 50 },
      },
    },
  };
  expect(ElectionRegisteredVoterCountsSchema.parse(counts)).toEqual(counts);
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

test('hasPartialRegisteredVoterCounts - all counts are totals in mixed forms', () => {
  const counts: ElectionRegisteredVoterCounts = {
    p1: 100,
    ps: { splits: { s1: { total: 30 }, s2: 40 } },
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
      splits: { s1: 100, s2: { total: 30, byParty: { DEM: 10, REP: 20 } } },
    },
  };
  expect(hasPartialRegisteredVoterCounts([pSplit], counts)).toEqual(true);
});

test('hasPartialRegisteredVoterCounts - non-split precinct with split counts', () => {
  const counts: ElectionRegisteredVoterCounts = {
    p1: { splits: { s1: 100 } },
    p2: 100,
  };
  expect(hasPartialRegisteredVoterCounts([p1, p2], counts)).toEqual(true);
});
