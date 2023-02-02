import { assert } from '@votingworks/basics';

import { QUERY_CLIENT_DEFAULT_OPTIONS } from './react_query';

test('Relevant settings are consistent for queries and mutations', () => {
  const querySettings = QUERY_CLIENT_DEFAULT_OPTIONS.queries;
  const mutationSettings = QUERY_CLIENT_DEFAULT_OPTIONS.mutations;

  expect(querySettings).toBeDefined();
  expect(mutationSettings).toBeDefined();
  assert(querySettings !== undefined);
  assert(mutationSettings !== undefined);

  expect(querySettings.networkMode).toEqual(mutationSettings.networkMode);
  expect(querySettings.retry).toEqual(mutationSettings.retry);
  expect(querySettings.useErrorBoundary).toEqual(
    mutationSettings.useErrorBoundary
  );
});
