import {
  AnyContest,
  BallotStyle,
  Contest,
  Election,
  PollingPlace,
  Precinct,
  PrecinctId,
  PrecinctOrSplit,
  PrecinctSplit,
  PrecinctWithoutSplits,
  PrecinctWithSplits,
  SystemSettings,
} from '@votingworks/types';
import { expect, test, vi } from 'vitest';
import {
  pollingPlaceBallotStyles,
  pollingPlaceContests,
  pollingPlaceFromSettings,
  pollingPlaceMembers,
  pollingPlacePrecinctIds,
  pollingPlacesGenerateFromPrecincts,
} from './polling_places';

test('pollingPlaceBallotStyles', () => {
  const precinct1 = mockPrecinctNoSplits({ id: 'p1' });
  const precinct2 = mockPrecinctWithSplits({
    id: 'p2',
    splits: [mockSplit({ id: 's1' }), mockSplit({ id: 's2' })],
  });

  const styleP1P3 = mockBallotStyle({ precincts: ['p1', 'p3'] });
  const styleP2 = mockBallotStyle({ precincts: ['p2'] });

  const election = mockElection({
    ballotStyles: [styleP1P3, styleP2],
    precincts: [precinct1, precinct2],
  });

  function expectStyles(place: Partial<PollingPlace>, expected: BallotStyle[]) {
    expect(pollingPlaceBallotStyles(election, mockPollingPlace(place))).toEqual(
      expected
    );
  }

  expectStyles({ precincts: { p1: { type: 'whole' } } }, [styleP1P3]);
  expectStyles({ precincts: { p2: { type: 'whole' } } }, [styleP2]);
  expectStyles(
    {
      precincts: {
        p1: { type: 'whole' },
        p2: { type: 'partial', splitIds: ['s1'] },
      },
    },
    [styleP1P3, styleP2]
  );
});

test('pollingPlaceContests', () => {
  const contest1 = mockContest({ id: 'c1', districtId: 'd1' });
  const contest2 = mockContest({ id: 'c2', districtId: 'd2' });
  const contest3 = mockContest({ id: 'c3', districtId: 'd3' });

  const precinct1 = mockPrecinctNoSplits({
    id: 'p1',
    districtIds: ['d1', 'd3'],
  });
  const precinct2 = mockPrecinctWithSplits({
    id: 'p2',
    splits: [
      mockSplit({ id: 's1', districtIds: ['d2'] }),
      mockSplit({ id: 's2', districtIds: ['d1', 'd3'] }),
    ],
  });

  const election = mockElection({
    contests: [contest1, contest2, contest3],
    precincts: [precinct1, precinct2],
  });

  function expectContests(
    place: Partial<PollingPlace>,
    expected: AnyContest[]
  ) {
    expect(pollingPlaceContests(election, mockPollingPlace(place))).toEqual(
      expected
    );
  }

  expectContests({ precincts: { p1: { type: 'whole' } } }, [
    contest1,
    contest3,
  ]);
  expectContests({ precincts: { p2: { type: 'whole' } } }, [
    contest1,
    contest2,
    contest3,
  ]);
  expectContests({ precincts: { p2: { type: 'partial', splitIds: ['s1'] } } }, [
    contest2,
  ]);
});

test('pollingPlaceFromSettings', () => {
  expect(() => pollingPlaceFromSettings('pp1', mockSettings({}))).toThrow(
    /pp1 not found/i
  );

  const place1 = mockPollingPlace({ id: 'pp1' });
  const place2 = mockPollingPlace({ id: 'pp2' });
  const settings = mockSettings({ pollingPlaces: [place2, place1] });

  expect(pollingPlaceFromSettings('pp1', settings)).toEqual(place1);

  expect(() => pollingPlaceFromSettings('pp3', settings)).toThrow(
    /pp3 not found/i
  );
});

test('pollingPlacesGenerateFromPrecincts', () => {
  const precinct1 = mockPrecinctNoSplits({
    id: 'p1',
    districtIds: ['d1', 'd3'],
    name: 'Precinct 1',
  });

  const precinct2 = mockPrecinctWithSplits({
    id: 'p2',
    name: 'Precinct 2',
    splits: [
      mockSplit({ id: 's1', districtIds: ['d2'] }),
      mockSplit({ id: 's2', districtIds: ['d1', 'd3'] }),
    ],
  });

  const newId = vi.fn<(p: Precinct) => string>((p) => `${p.id}-polling-place`);

  expect(pollingPlacesGenerateFromPrecincts([], 'absentee', newId)).toEqual([]);

  expect(
    pollingPlacesGenerateFromPrecincts([precinct2], 'early_voting', newId)
  ).toEqual<PollingPlace[]>([
    {
      id: 'p2-polling-place',
      name: 'Precinct 2',
      type: 'early_voting',
      precincts: { p2: { type: 'whole' } },
    },
  ]);

  expect(
    pollingPlacesGenerateFromPrecincts(
      [precinct1, precinct2],
      'election_day',
      newId
    )
  ).toEqual<PollingPlace[]>([
    {
      id: 'p1-polling-place',
      name: 'Precinct 1',
      type: 'election_day',
      precincts: { p1: { type: 'whole' } },
    },
    {
      id: 'p2-polling-place',
      name: 'Precinct 2',
      type: 'election_day',
      precincts: { p2: { type: 'whole' } },
    },
  ]);
});

test('pollingPlaceMembers', () => {
  const split1 = mockSplit({ id: 's1' });
  const split2 = mockSplit({ id: 's2' });

  const precinct1 = mockPrecinctNoSplits({ id: 'p1' });
  const precinct2 = mockPrecinctNoSplits({ id: 'p2' });
  const precinct3 = mockPrecinctWithSplits({
    id: 'p3',
    splits: [split1, split2],
  });

  const election = mockElection({
    precincts: [precinct1, precinct2, precinct3],
  });

  function expectMembers(
    place: Partial<PollingPlace>,
    expected: PrecinctOrSplit[]
  ) {
    expect(pollingPlaceMembers(election, mockPollingPlace(place))).toEqual(
      expected
    );
  }

  expectMembers(
    {
      precincts: {
        p1: { type: 'whole' },
        p3: { type: 'whole' },
      },
    },
    [
      { precinct: precinct1 },
      { precinct: precinct3, split: split1 },
      { precinct: precinct3, split: split2 },
    ]
  );

  expectMembers(
    {
      precincts: {
        p2: { type: 'whole' },
        p3: { type: 'partial', splitIds: ['s2'] },
      },
    },
    [{ precinct: precinct2 }, { precinct: precinct3, split: split2 }]
  );
});

test('pollingPlacePrecinctIds', () => {
  const split1 = mockSplit({ id: 's1' });
  const split2 = mockSplit({ id: 's2' });

  const precinct1 = mockPrecinctNoSplits({ id: 'p1' });
  const precinct2 = mockPrecinctWithSplits({
    id: 'p2',
    splits: [split1, split2],
  });

  const election = mockElection({ precincts: [precinct1, precinct2] });

  function expectPrecinctIds(
    place: Partial<PollingPlace>,
    expected: PrecinctId[]
  ) {
    expect(pollingPlacePrecinctIds(election, mockPollingPlace(place))).toEqual(
      new Set(expected)
    );
  }

  expectPrecinctIds(
    {
      precincts: {
        p1: { type: 'whole' },
        p2: { type: 'whole' },
      },
    },
    ['p1', 'p2']
  );

  expectPrecinctIds(
    {
      precincts: {
        p1: { type: 'whole' },
        p2: { type: 'partial', splitIds: ['s2'] },
      },
    },
    ['p1', 'p2']
  );
});

function mockBallotStyle(partial: Partial<BallotStyle>): BallotStyle {
  return partial as BallotStyle;
}

function mockContest(partial: Partial<Contest>): AnyContest {
  return partial as AnyContest;
}

function mockElection(partial: Partial<Election>): Election {
  return partial as Election;
}

function mockPollingPlace(partial: Partial<PollingPlace>): PollingPlace {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  return partial as PollingPlace;
}

function mockPrecinctNoSplits(
  partial: Partial<PrecinctWithoutSplits>
): PrecinctWithoutSplits {
  return partial as PrecinctWithoutSplits;
}

function mockPrecinctWithSplits(
  partial: Partial<PrecinctWithSplits>
): PrecinctWithSplits {
  return partial as PrecinctWithSplits;
}

function mockSettings(partial: Partial<SystemSettings>): SystemSettings {
  return partial as SystemSettings;
}

function mockSplit(partial: Partial<PrecinctSplit>): PrecinctSplit {
  return partial as PrecinctSplit;
}
