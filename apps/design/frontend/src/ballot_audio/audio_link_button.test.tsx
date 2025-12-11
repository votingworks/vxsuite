import React from 'react';
import { expect, test } from 'vitest';
import { Route, Router } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'history';

import { sleep } from '@votingworks/basics';
import { StateFeaturesConfig } from '@votingworks/design-backend';

import { act, render, screen } from '../../test/react_testing_library';
import { AudioLinkButton } from './audio_link_button';
import { createMockApiClient, provideApi } from '../../test/api_helpers';
import { electionParamRoutes, routes } from '../routes';

const electionId = 'election-1';

test('navigates to given href', async () => {
  const { history } = renderInContext(
    { AUDIO_PROOFING: true },
    <AudioLinkButton
      aria-label="Preview or Edit Audio"
      to="/audio/edit"
      tooltip="Preview/Edit Audio"
    />
  );

  userEvent.click(await screen.findButton('Preview or Edit Audio'));
  expect(history.location.pathname).toEqual('/audio/edit');
});

test('shows tooltip on hover', async () => {
  renderInContext(
    { AUDIO_PROOFING: true },
    <AudioLinkButton
      aria-label="Preview or Edit Audio"
      to="/audio/edit"
      tooltip="Preview/Edit Audio"
    />
  );

  userEvent.hover(await screen.findButton('Preview or Edit Audio'));
  screen.getByText('Preview/Edit Audio');
});

test('is omitted when audio proofing feature is turned off', async () => {
  renderInContext(
    { AUDIO_PROOFING: false },
    <AudioLinkButton
      aria-label="Preview or Edit Audio"
      to="/audio/edit"
      tooltip="Preview/Edit Audio"
    />
  );

  await act(() => sleep(0));
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

function renderInContext(features: StateFeaturesConfig, ui: React.ReactNode) {
  const history = createMemoryHistory({
    initialEntries: [routes.election(electionId).root.path],
  });

  const mockApi = createMockApiClient();
  mockApi.getStateFeatures.expectCallWith({ electionId }).resolves(features);

  const result = render(
    provideApi(
      mockApi,
      <Router history={history}>
        <Route path={electionParamRoutes.root.path}>{ui}</Route>
        <Route path="/" />
      </Router>
    )
  );

  mockApi.assertComplete();

  return { history, result };
}
