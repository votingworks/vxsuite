import { expect, test, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createMemoryHistory } from 'history';
import { ok } from '@votingworks/basics';
import userEvent from '@testing-library/user-event';
import {
  createMockApiClient,
  MockApiClient,
  mockUserFeatures,
  multiOrgUser,
  org,
  org2,
  provideApi,
  user,
} from '../test/api_helpers';
import { CreateElectionButton } from './create_election_button';
import { routes } from './routes';
import { screen, render, waitFor, within } from '../test/react_testing_library';
import { withRoute } from '../test/routing_helpers';
import { makeIdFactory } from '../test/id_helpers';

const idFactory = makeIdFactory();

let apiMock: MockApiClient;

function renderButton(
  props?: React.ComponentProps<typeof CreateElectionButton>
) {
  const { path } = routes.root;
  const history = createMemoryHistory({ initialEntries: [path] });
  render(
    provideApi(
      apiMock,
      withRoute(<CreateElectionButton {...props} />, {
        history,
        paramPath: path,
        path,
      })
    )
  );
  return history;
}

beforeEach(() => {
  apiMock = createMockApiClient();
  idFactory.reset();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('creates election for single org user', async () => {
  apiMock.getUser.expectCallWith().resolves(user);
  mockUserFeatures(apiMock, { ACCESS_ALL_ORGS: false });
  const history = renderButton();

  const newId = idFactory.next();
  apiMock.createElection
    .expectCallWith({
      jurisdictionId: org.id,
      id: newId,
    })
    .resolves(ok(newId));

  const button = await screen.findByRole('button', { name: 'Create Election' });
  userEvent.click(button);

  await waitFor(() =>
    expect(history.location.pathname).toEqual(`/elections/${newId}`)
  );
});

test('shows modal with org selector for multi-org user', async () => {
  apiMock.getUser.expectCallWith().resolves(multiOrgUser);
  mockUserFeatures(apiMock, { ACCESS_ALL_ORGS: false });
  apiMock.listJurisdictions.expectCallWith().resolves([org, org2]);
  const history = renderButton();

  const button = await screen.findByRole('button', { name: 'Create Election' });
  userEvent.click(button);

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Create Election' });
  const orgSelect = within(modal).getByRole('combobox', {
    name: 'Organization',
  });
  within(modal).getByText(org.name);
  userEvent.click(orgSelect);
  const orgOptions = await screen.findAllByRole('option');
  expect(orgOptions.map((o) => o.textContent)).toEqual([org.name, org2.name]);
  userEvent.click(orgOptions[1]);

  const newId = idFactory.next();
  apiMock.createElection
    .expectCallWith({
      jurisdictionId: org2.id,
      id: newId,
    })
    .resolves(ok(newId));

  const createButton = within(modal).getByRole('button', {
    name: 'Confirm',
  });
  userEvent.click(createButton);

  await waitFor(() =>
    expect(history.location.pathname).toEqual(`/elections/${newId}`)
  );
});

test('shows modal when ACCESS_ALL_ORGS feature is enabled', async () => {
  apiMock.getUser.expectCallWith().resolves(user);
  mockUserFeatures(apiMock, { ACCESS_ALL_ORGS: true });
  apiMock.listJurisdictions.expectCallWith().resolves([org, org2]);
  renderButton();

  const button = await screen.findByRole('button', { name: 'Create Election' });
  userEvent.click(button);

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('combobox', { name: 'Organization' });
});
