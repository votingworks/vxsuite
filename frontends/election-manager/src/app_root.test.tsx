import { screen } from '@testing-library/react';
import { fakeLogger } from '@votingworks/logging';
import { MemoryCard, MemoryHardware, NullPrinter } from '@votingworks/utils';
import fetchMock from 'fetch-mock';
import React from 'react';
import { BrowserRouter, Route } from 'react-router-dom';
import { fakeMachineConfigProvider } from '../test/helpers/fake_machine_config';
import { renderInQueryClientContext } from '../test/render_in_app_context';
import { AppRoot } from './app_root';
import { ElectionManagerStoreMemoryBackend } from './lib/backends';

beforeEach(() => {
  fetchMock.get(/^\/convert/, {});
});

test('renders without crashing', async () => {
  renderInQueryClientContext(
    <BrowserRouter>
      <Route
        path="/"
        render={(props) => (
          <AppRoot
            logger={fakeLogger()}
            backend={new ElectionManagerStoreMemoryBackend()}
            printer={new NullPrinter()}
            hardware={MemoryHardware.buildStandard()}
            card={new MemoryCard()}
            machineConfigProvider={fakeMachineConfigProvider()}
            {...props}
          />
        )}
      />
    </BrowserRouter>
  );

  await screen.findByText('VxAdmin is Locked');
});
