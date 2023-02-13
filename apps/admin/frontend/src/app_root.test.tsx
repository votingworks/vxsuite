import { screen } from '@testing-library/react';
import { MemoryHardware, NullPrinter } from '@votingworks/shared';
import fetchMock from 'fetch-mock';
import React from 'react';
import { BrowserRouter, Route } from 'react-router-dom';
import { fakeMachineConfigProvider } from '../test/helpers/fake_machine_config';
import { renderRootElement } from '../test/render_in_app_context';
import { AppRoot } from './app_root';
import { createMockApiClient, MockApiClient } from '../test/helpers/api';

let mockApiClient: MockApiClient;

beforeEach(() => {
  mockApiClient = createMockApiClient();
  fetchMock.get(/^\/convert/, {});
});

afterEach(() => {
  mockApiClient.assertComplete();
});

test('renders without crashing', async () => {
  renderRootElement(
    <BrowserRouter>
      <Route
        path="/"
        render={(props) => (
          <AppRoot
            printer={new NullPrinter()}
            hardware={MemoryHardware.buildStandard()}
            machineConfigProvider={fakeMachineConfigProvider()}
            {...props}
          />
        )}
      />
    </BrowserRouter>,
    { apiClient: mockApiClient }
  );

  await screen.findByText('VxAdmin is Locked');
});
