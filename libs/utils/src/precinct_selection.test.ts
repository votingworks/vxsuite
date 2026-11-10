import { expect, test } from 'vitest';
import { singlePrecinctSelectionFor } from './precinct_selection.js';

test('singlePrecinctSelectionFor', () => {
  expect(singlePrecinctSelectionFor('precinct-id')).toMatchObject({
    kind: 'SinglePrecinct',
    precinctId: 'precinct-id',
  });
});
