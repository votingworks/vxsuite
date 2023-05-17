import { MemoryHardware, NullPrinter } from '@votingworks/utils';
import fetchMock from 'fetch-mock';
import React from 'react';
import { BrowserRouter, Route } from 'react-router-dom';
import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import { LogSource, Logger } from '@votingworks/logging';
import { screen } from '../test/react_testing_library';
import { renderRootElement } from '../test/render_in_app_context';
import { AppRoot } from './app_root';
import { ApiMock, createApiMock } from '../test/helpers/api_mock';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
  fetchMock.get(/^\/convert/, {});
});

afterEach(() => {
  apiMock.assertComplete();
});

test('renders without crashing', async () => {
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });
  apiMock.expectGetCurrentElectionMetadata({
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
  });
  apiMock.expectGetCastVoteRecords([]);
  apiMock.expectGetFullElectionManualTally();
  apiMock.expectGetMachineConfig();
  renderRootElement(
    <BrowserRouter>
      <Route
        path="/"
        render={(props) => (
          <AppRoot
            printer={new NullPrinter()}
            hardware={MemoryHardware.buildStandard()}
            logger={new Logger(LogSource.VxAdminFrontend)}
            {...props}
          />
        )}
      />
    </BrowserRouter>,
    { apiClient: apiMock.apiClient }
  );

  await screen.findByText('VxAdmin is Locked');
});
