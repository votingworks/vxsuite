import { expect, test, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createMemoryHistory } from 'history';
import { ok } from '@votingworks/basics';
import userEvent from '@testing-library/user-event';
import {
  createMockApiClient,
  MockApiClient,
  multiJurisdictionUser,
  jurisdiction,
  jurisdiction2,
  provideApi,
  user,
  organizationUser,
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

test('creates election for single jurisdiction user', async () => {
  apiMock.getUser.expectCallWith().resolves(user);
  const history = renderButton();

  const newId = idFactory.next();
  apiMock.createElection
    .expectCallWith({
      jurisdictionId: jurisdiction.id,
      id: newId,
    })
    .resolves(ok(newId));

  const button = await screen.findByRole('button', { name: 'Create Election' });
  userEvent.click(button);

  await waitFor(() =>
    expect(history.location.pathname).toEqual(`/elections/${newId}`)
  );
});

test('shows modal with jurisdiction selector for multi-jurisdiction user', async () => {
  apiMock.getUser.expectCallWith().resolves(multiJurisdictionUser);
  apiMock.listJurisdictions
    .expectCallWith()
    .resolves(multiJurisdictionUser.jurisdictions);
  const history = renderButton();

  const button = await screen.findByRole('button', { name: 'Create Election' });
  userEvent.click(button);

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Create Election' });
  const jurisdictionSelect = within(modal).getByRole('combobox', {
    name: 'Jurisdiction',
  });
  within(modal).getByText(jurisdiction.name);
  userEvent.click(jurisdictionSelect);
  const jurisdictionOptions = await screen.findAllByRole('option');
  expect(jurisdictionOptions.map((o) => o.textContent)).toEqual(
    multiJurisdictionUser.jurisdictions.map((j) => j.name)
  );
  userEvent.click(jurisdictionOptions[1]);

  const newId = idFactory.next();
  apiMock.createElection
    .expectCallWith({
      jurisdictionId: jurisdiction2.id,
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

test('shows modal with jurisdiction selector for organization user', async () => {
  apiMock.getUser.expectCallWith().resolves(organizationUser);
  apiMock.listJurisdictions
    .expectCallWith()
    .resolves([jurisdiction, jurisdiction2]);
  renderButton();
  const button = await screen.findByRole('button', { name: 'Create Election' });
  userEvent.click(button);
  await screen.findByRole('alertdialog');
});
