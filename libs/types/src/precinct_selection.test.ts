import { election } from '../test/election';
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
      getPrecinctSelectionName(election.precincts, ALL_PRECINCTS_SELECTION)
    ).toEqual(ALL_PRECINCTS_NAME);
  });

  test('handles Single Precinct case', () => {
    expect(
      getPrecinctSelectionName(election.precincts, {
        kind: 'SinglePrecinct',
        precinctId: 'P',
      })
    ).toEqual('PRECINCT');
  });

  test('throws error if precinct not found', () => {
    expect(() => {
      getPrecinctSelectionName(election.precincts, {
        kind: 'SinglePrecinct',
        precinctId: 'none',
      });
    }).toThrowError();
  });
});
