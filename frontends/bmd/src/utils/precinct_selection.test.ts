import { election } from '../../test/helpers/election';
import { PrecinctSelectionKind } from '../config/types';
import { precinctSelectionName } from './precinct_selection';

test('single precinct with no matching precincts', () => {
  expect(() =>
    precinctSelectionName([], {
      kind: PrecinctSelectionKind.SinglePrecinct,
      precinctId: 'nope',
    })
  ).toThrow();
});

test('single precinct with matching precinct', () => {
  expect(
    precinctSelectionName(election.precincts, {
      kind: PrecinctSelectionKind.SinglePrecinct,
      precinctId: '23',
    })
  ).toEqual('Center Springfield');
});

test('all precincts', () => {
  expect(
    precinctSelectionName([], { kind: PrecinctSelectionKind.AllPrecincts })
  ).toEqual('All Precincts');
});
