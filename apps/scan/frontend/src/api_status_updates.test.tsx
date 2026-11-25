import { beforeEach, test, vi } from 'vitest';
import {
  type ApiMock,
  createApiMock,
  provideApi,
  statusNoPaper,
} from '../test/helpers/mock_api_client.js';
import { render, screen } from '../test/react_testing_library.js';
import { getScannerStatus } from './api.js';

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiMock = createApiMock();
  apiMock.expectGetConfig();
});

function BallotCount(): JSX.Element {
  const query = getScannerStatus.useQuery();
  return <div>Ballots: {query.data?.ballotsCounted ?? 'unknown'}</div>;
}

test('caches each scanner status the backend reports', async () => {
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 3 });
  render(provideApi(apiMock, <BallotCount />));
  await screen.findByText('Ballots: 3');
  apiMock.expectGetScannerStatus({ ...statusNoPaper, ballotsCounted: 4 });
  await screen.findByText('Ballots: 4');
});
