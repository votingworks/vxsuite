import { describe, expect, test } from 'vitest';
import { readElectionGeneral } from '@votingworks/fixtures';
import {
  ALL_PRECINCTS_NAME,
  ALL_PRECINCTS_SELECTION,
  areEqualPrecinctSelections,
  getPrecinctSelectionName,
  singlePrecinctSelectionFor,
} from './precinct_selection';

const electionGeneral = readElectionGeneral();

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
        electionGeneral.precincts,
        ALL_PRECINCTS_SELECTION
      )
    ).toEqual(ALL_PRECINCTS_NAME);
  });

  test('handles Single Precinct case', () => {
    expect(
      getPrecinctSelectionName(electionGeneral.precincts, {
        kind: 'SinglePrecinct',
        precinctId: '23',
      })
    ).toEqual('Center Springfield');
  });

  test('throws error if precinct not found', () => {
    expect(() => {
      getPrecinctSelectionName(electionGeneral.precincts, {
        kind: 'SinglePrecinct',
        precinctId: 'none',
      });
    }).toThrowError();
  });
});

describe('areEqualPrecinctSelections', () => {
  test('both are All Precincts', () => {
    expect(
      areEqualPrecinctSelections(
        ALL_PRECINCTS_SELECTION,
        ALL_PRECINCTS_SELECTION
      )
    ).toEqual(true);
  });

  test('first is All Precincts, second is not', () => {
    expect(
      areEqualPrecinctSelections(
        ALL_PRECINCTS_SELECTION,
        singlePrecinctSelectionFor('precinct-1')
      )
    ).toEqual(false);
  });

  test('second is All Precincts, first is not', () => {
    expect(
      areEqualPrecinctSelections(
        singlePrecinctSelectionFor('precinct-1'),
        ALL_PRECINCTS_SELECTION
      )
    ).toEqual(false);
  });

  test('two different single precincts', () => {
    expect(
      areEqualPrecinctSelections(
        singlePrecinctSelectionFor('precinct-1'),
        singlePrecinctSelectionFor('precinct-2')
      )
    ).toEqual(false);
  });

  test('same single precinct', () => {
    expect(
      areEqualPrecinctSelections(
        singlePrecinctSelectionFor('precinct-1'),
        singlePrecinctSelectionFor('precinct-1')
      )
    ).toEqual(true);
  });
});
