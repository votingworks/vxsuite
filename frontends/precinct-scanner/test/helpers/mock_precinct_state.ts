import { PrecinctSelection } from '@votingworks/types';
import fetchMock from 'fetch-mock';

export function mockPrecinctState(precinctSelection?: PrecinctSelection): void {
  fetchMock.get(
    '/precinct-scanner/config/precinct',
    precinctSelection
      ? {
          body: {
            status: 'ok',
            precinctSelection,
          },
        }
      : { body: { status: 'ok' } },
    { overwriteRoutes: true }
  );
}

export function mockPrecinctStateChange(
  precinctSelection: PrecinctSelection
): void {
  fetchMock.putOnce(
    { url: '/precinct-scanner/config/precinct', body: { precinctSelection } },
    {
      body: { status: 'ok' },
    }
  );
  mockPrecinctState(precinctSelection);
}
