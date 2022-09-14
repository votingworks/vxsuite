import { screen } from '@testing-library/react';
import { MemoryCard, MemoryHardware, NullPrinter } from '@votingworks/utils';
import fetchMock from 'fetch-mock';
import React from 'react';
import { BrowserRouter, Route } from 'react-router-dom';
import { fakeMachineConfigProvider } from '../test/helpers/fake_machine_config';
import { renderRootElement } from '../test/render_in_app_context';
import { AppRoot } from './app_root';

beforeEach(() => {
  fetchMock.get(/^\/convert/, {});
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
