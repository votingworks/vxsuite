import { electionSample } from '@votingworks/fixtures';
import {
  ALL_PRECINCTS_NAME,
  ALL_PRECINCTS_SELECTION,
  getPrecinctSelectionName,
  singlePrecinctSelectionFor,
} from './precinct_selection';

test('singlePrecinctSelectionFor', () => {
  expect(singlePrecinctSelectionFor('precinct-id')).toMatchObject({
    kind: 'SinglePrecinct',
    precinctId: 'precinct-id',
  });
});

describe('getPrecinctSelectionName', () => {
  test('handles All Precinct case', () => {
    expect(
      getPrecinctSelectionName(
        electionSample.precincts,
        ALL_PRECINCTS_SELECTION
      )
    ).toEqual(ALL_PRECINCTS_NAME);
  });

  test('handles Single Precinct case', () => {
    expect(
      getPrecinctSelectionName(electionSample.precincts, {
        kind: 'SinglePrecinct',
        precinctId: '23',
      })
    ).toEqual('Center Springfield');
  });

  test('throws error if precinct not found', () => {
    expect(() => {
      getPrecinctSelectionName(electionSample.precincts, {
        kind: 'SinglePrecinct',
        precinctId: 'none',
      });
    }).toThrowError();
  });
});
