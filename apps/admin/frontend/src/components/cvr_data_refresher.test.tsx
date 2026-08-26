import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client.js';
import { renderInAppContext } from '../../test/render_in_app_context.js';
import { createQueryClient } from '../api.js';
import { CvrDataRefresher } from './cvr_data_refresher.js';
import { DEFAULT_QUERY_REFETCH_INTERVAL } from '../utils/globals.js';

let apiMock: ApiMock;
let queryClient: QueryClient;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiMock = createApiMock();
  queryClient = createQueryClient();
});

afterEach(() => {
  apiMock.assertComplete();
});

function isInvalidated(queryKey: unknown[]): boolean | undefined {
  return queryClient.getQueryState(queryKey)?.isInvalidated;
}

test('marks CVR-derived queries stale when the data version changes', async () => {
  const versionMock = apiMock.apiClient.getCastVoteRecordsDataVersion;
  apiMock.setCastVoteRecordsDataVersion(3);

  queryClient.setQueryData(['getCastVoteRecordFiles'], []);
  queryClient.setQueryData(['getBallotAdjudicationQueue'], ['cvr-1']);

  renderInAppContext(<CvrDataRefresher />, { apiMock, queryClient });
  await vi.waitFor(() => expect(versionMock).toHaveBeenCalled());
  vi.advanceTimersByTime(DEFAULT_QUERY_REFETCH_INTERVAL);
  await vi.waitFor(() => expect(versionMock).toHaveBeenCalledTimes(2));

  // Seeing the same version again is not a change
  expect(isInvalidated(['getCastVoteRecordFiles'])).toEqual(false);

  apiMock.setCastVoteRecordsDataVersion(4);
  vi.advanceTimersByTime(DEFAULT_QUERY_REFETCH_INTERVAL);
  await vi.waitFor(() =>
    expect(isInvalidated(['getCastVoteRecordFiles'])).toEqual(true)
  );
  expect(isInvalidated(['getBallotAdjudicationQueue'])).toEqual(true);
});
