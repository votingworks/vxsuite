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
import { AppRoot } from './app_root';
import { fakeMachineConfigProvider } from '../test/helpers/fake_machine_config';

beforeEach(() => {
  fetchMock.get(/^\/convert/, {});
});

test('renders without crashing', async () => {
  await act(async () => {
    const storage = new MemoryStorage();
    render(
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
    );
  });
});
