import fetchMock from 'fetch-mock';
import React from 'react';
import { render } from '@testing-library/react';
import { act } from 'react-dom/test-utils';

import { BrowserRouter, Route } from 'react-router-dom';

// import { electionSample } from '@votingworks/fixtures'
import {
  MemoryCard,
  MemoryHardware,
  MemoryStorage,
  NullPrinter,
} from '@votingworks/utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRoot } from './app_root';
import { fakeMachineConfigProvider } from '../test/helpers/fake_machine_config';

beforeEach(() => {
  fetchMock.get(/^\/convert/, {});
});

test('renders without crashing', async () => {
  // eslint-disable-next-line @typescript-eslint/require-await
  await act(async () => {
    const storage = new MemoryStorage();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BrowserRouter>
          <Route
            path="/"
            render={(props) => (
              <AppRoot
                storage={storage}
                printer={new NullPrinter()}
                hardware={new MemoryHardware()}
                card={new MemoryCard()}
                machineConfigProvider={fakeMachineConfigProvider()}
                {...props}
              />
            )}
          />
        </BrowserRouter>
      </QueryClientProvider>
    );
  });
});
