import { PollsState } from '@votingworks/types';
import fetchMock from 'fetch-mock';

export function mockPollsState(pollsState: PollsState): void {
  fetchMock.get(
    '/precinct-scanner/config/polls',
    {
      body: {
        status: 'ok',
        pollsState,
      },
    },
    { overwriteRoutes: true }
  );
}

export function mockPollsStateChange(pollsState: PollsState): void {
  fetchMock.putOnce(
    { url: '/precinct-scanner/config/polls', body: { pollsState } },
    {
      body: { status: 'ok' },
    }
  );
  mockPollsState(pollsState);
}
