import { PrecinctIdSchema, unsafeParse } from '@votingworks/types';
import { election } from '../../test/helpers/election';
import { PrecinctSelectionKind } from '../config/types';
import { precinctSelectionName } from './precinct_selection';

test('single precinct with no matching precincts', () => {
  expect(() =>
    precinctSelectionName([], {
      kind: PrecinctSelectionKind.SinglePrecinct,
      precinctId: unsafeParse(PrecinctIdSchema, 'nope'),
    })
  ).toThrow();
});

test('single precinct with matching precinct', () => {
  expect(
    precinctSelectionName(election.precincts, {
      kind: PrecinctSelectionKind.SinglePrecinct,
      precinctId: unsafeParse(PrecinctIdSchema, '23'),
    })
  ).toEqual('Center Springfield');
});

test('all precincts', () => {
  expect(
    precinctSelectionName([], { kind: PrecinctSelectionKind.AllPrecincts })
  ).toEqual('All Precincts');
});
