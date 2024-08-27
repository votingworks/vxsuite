import { election } from '../test/election';
import { GridLayout, GridLayoutAccuvoteMetadata } from './election';
import { getGridLayoutForAccuvoteMetadata } from './election_utils';

const metadata: GridLayoutAccuvoteMetadata = {
  front: {
    side: 'front',
    batchOrPrecinctNumber: 0,
    cardNumber: 0,
    computedMod4Checksum: 0,
    mod4Checksum: 0,
    sequenceNumber: 0,
    startBit: 0,
  },
  back: {
    side: 'back',
    electionDay: 3,
    electionMonth: 11,
    electionType: 'G',
    electionYear: 2020,
  },
};

test('getGridLayoutForAccuvoteMetadata no grid layouts', () => {
  expect(election.gridLayouts).toBeUndefined();
  expect(
    getGridLayoutForAccuvoteMetadata({
      election,
      metadata,
    })
  ).toBeUndefined();
});

test('getGridLayoutForAccuvoteMetadata matching grid layout', () => {
  const gridLayout: GridLayout = {
    ballotStyleId: '1',
    gridPositions: [],
    optionBoundsFromTargetMark: {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    },
    accuvoteMetadata: metadata,
  };
  expect(
    getGridLayoutForAccuvoteMetadata({
      election: {
        ...election,
        gridLayouts: [gridLayout],
      },
      metadata,
    })
  ).toEqual(gridLayout);
});

test('getGridLayoutForAccuvoteMetadata no matching grid layout', () => {
  const gridLayout: GridLayout = {
    ballotStyleId: '1',
    gridPositions: [],
    optionBoundsFromTargetMark: {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    },
    accuvoteMetadata: metadata,
  };
  expect(
    getGridLayoutForAccuvoteMetadata({
      election: {
        ...election,
        gridLayouts: [gridLayout],
      },
      metadata: {
        front: {
          ...metadata.front,
          cardNumber: 1,
        },
        back: metadata.back,
      },
    })
  ).toBeUndefined();
});

test('getGridLayoutForAccuvoteMetadata no accuvote metadata', () => {
  const gridLayout: GridLayout = {
    ballotStyleId: '1',
    gridPositions: [],
    optionBoundsFromTargetMark: {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    },
  };
  expect(
    getGridLayoutForAccuvoteMetadata({
      election: {
        ...election,
        gridLayouts: [gridLayout],
      },
      metadata,
    })
  ).toBeUndefined();
});
