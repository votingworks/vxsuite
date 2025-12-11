import { createMemoryHistory } from 'history';
import userEvent from '@testing-library/user-event';
import { File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, test, expect } from 'vitest';
import { err, ok } from '@votingworks/basics';
import { within } from '@testing-library/react';
import { Jurisdiction, User } from '@votingworks/design-backend';
import {
  MockApiClient,
  multiJurisdictionUser,
  jurisdiction,
  jurisdiction2,
  user,
  provideApi,
  createMockApiClient,
  organization,
} from '../test/api_helpers';
import { withRoute } from '../test/routing_helpers';
import { routes } from './routes';
import { render, screen, waitFor } from '../test/react_testing_library';
import { LoadElectionButton } from './load_election_button';
import { makeIdFactory } from '../test/id_helpers';

// Change global File to ensure File.text exists
global.File = NodeFile as unknown as typeof global.File;

const idFactory = makeIdFactory();

let apiMock: MockApiClient;

function renderButton(props?: React.ComponentProps<typeof LoadElectionButton>) {
  const { path } = routes.root;
  const history = createMemoryHistory({ initialEntries: [path] });
  render(
    provideApi(
      apiMock,
      withRoute(<LoadElectionButton {...props} />, {
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

const mockElectionData = 'mock election data';
const mockElectionFile = new File([mockElectionData], 'election.json', {
  type: 'application/json',
});

const msJurisdiction: Jurisdiction = {
  id: 'ms-jurisdiction-1',
  name: 'Mississippi Jurisdiction',
  stateCode: 'MS',
  organization,
};

const msUser: User = {
  ...user,
  jurisdictions: [msJurisdiction],
};

test('single jurisdiction: VXF', async () => {
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.listJurisdictions.expectCallWith().resolves([jurisdiction]);
  const history = renderButton();
  const button = await screen.findByRole('button', { name: 'Load Election' });
  userEvent.click(button);

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Load Election' });
  expect(
    within(modal).queryByLabelText('Jurisdiction')
  ).not.toBeInTheDocument();
  expect(within(modal).queryByLabelText('Format')).not.toBeInTheDocument();

  const loadButton = within(modal).getByRole('button', {
    name: 'Load Election',
  });
  expect(loadButton).toBeDisabled();

  const electionFileInput = within(modal).getByLabelText(
    'Select Election File…'
  );
  userEvent.upload(electionFileInput, mockElectionFile);

  const newId = idFactory.next();
  idFactory.reset();
  apiMock.loadElection
    .expectCallWith({
      newId,
      jurisdictionId: jurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: mockElectionData,
      },
    })
    .resolves(ok(newId));
  userEvent.click(loadButton);

  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  expect(history.location.pathname).toEqual(`/elections/${newId}`);
});

test('single jurisdiction: MS SEMS', async () => {
  apiMock.getUser.expectCallWith().resolves(msUser);
  apiMock.listJurisdictions.expectCallWith().resolves([msJurisdiction]);
  const history = renderButton();
  const button = await screen.findByRole('button', { name: 'Load Election' });
  userEvent.click(button);

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Load Election' });
  expect(
    within(modal).queryByLabelText('Jurisdiction')
  ).not.toBeInTheDocument();
  // Defaults to MS SEMS format, with option to select VXF
  userEvent.click(within(modal).getByText('Mississippi SEMS'));
  screen.getByText('VotingWorks');

  const loadButton = within(modal).getByRole('button', {
    name: 'Load Election',
  });
  expect(loadButton).toBeDisabled();

  const mockElectionCsv = new File([mockElectionData], 'election.csv', {
    type: 'text/csv',
  });
  const electionFileInput = within(modal).getByLabelText(
    'Select Election File…'
  );
  userEvent.upload(electionFileInput, mockElectionCsv);

  const candidateFileInput = within(modal).getByLabelText(
    'Select Candidate File…'
  );
  const mockCandidateData = 'mock candidate data';
  const mockCandidateFile = new File([mockCandidateData], 'candidates.txt', {
    type: 'text/csv',
  });
  userEvent.upload(candidateFileInput, mockCandidateFile);

  const newId = idFactory.next();
  idFactory.reset();
  apiMock.loadElection
    .expectCallWith({
      newId,
      jurisdictionId: msJurisdiction.id,
      upload: {
        format: 'ms-sems',
        electionFileContents: mockElectionData,
        candidateFileContents: mockCandidateData,
      },
    })
    .resolves(ok(newId));
  userEvent.click(loadButton);

  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  expect(history.location.pathname).toEqual(`/elections/${newId}`);
});

test('multi-jurisdiction user sees jurisdiction selector', async () => {
  apiMock.getUser.expectCallWith().resolves({
    ...multiJurisdictionUser,
    jurisdictions: [...multiJurisdictionUser.jurisdictions, msJurisdiction],
  });
  apiMock.listJurisdictions
    .expectCallWith()
    .resolves([jurisdiction, jurisdiction2, msJurisdiction]);
  renderButton();

  const button = await screen.findByRole('button', { name: 'Load Election' });
  userEvent.click(button);

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Load Election' });
  const jurisdictionSelect = within(modal).getByRole('combobox', {
    name: /Jurisdiction/,
  });
  within(modal).getByText(jurisdiction.name);
  userEvent.click(jurisdictionSelect);
  const jurisdictionOptions = await screen.findAllByRole('option');
  expect(jurisdictionOptions.map((o) => o.textContent)).toEqual([
    jurisdiction.name,
    jurisdiction2.name,
    msJurisdiction.name,
  ]);
  // Select MS jurisdiction to show format selector
  userEvent.click(jurisdictionOptions[2]);

  // Format selector defaults to MS SEMS. Switch to VXF.
  within(modal).getByRole('combobox', { name: /Format/ });
  userEvent.click(within(modal).getByText('Mississippi SEMS'));
  userEvent.click(screen.getByRole('option', { name: 'VotingWorks' }));

  apiMock.loadElection
    .expectCallWith({
      newId: 'test-random-id-1',
      jurisdictionId: msJurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: mockElectionData,
      },
    })
    .resolves(ok('test-random-id-1'));

  const electionFileInput = within(modal).getByLabelText(
    'Select Election File…'
  );
  userEvent.upload(electionFileInput, mockElectionFile);

  userEvent.click(within(modal).getByRole('button', { name: 'Load Election' }));

  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

test('close modal', async () => {
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.listJurisdictions.expectCallWith().resolves([jurisdiction]);
  renderButton();
  const button = await screen.findByRole('button', { name: 'Load Election' });
  userEvent.click(button);

  const modal = await screen.findByRole('alertdialog');
  userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

test('shows error message on upload failure', async () => {
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.listJurisdictions.expectCallWith().resolves([jurisdiction]);
  const history = renderButton();

  userEvent.click(await screen.findByRole('button', { name: 'Load Election' }));
  const modal = await screen.findByRole('alertdialog');
  const electionFileInput = within(modal).getByLabelText(
    'Select Election File…'
  );
  userEvent.upload(electionFileInput, mockElectionFile);

  const newId = idFactory.next();
  idFactory.reset();
  const errorMessage = 'mock error message';
  apiMock.loadElection
    .expectCallWith({
      newId,
      jurisdictionId: jurisdiction.id,
      upload: {
        format: 'vxf',
        electionFileContents: mockElectionData,
      },
    })
    .resolves(err(new Error('mock error message')));
  userEvent.click(within(modal).getByRole('button', { name: 'Load Election' }));

  await screen.findByRole('heading', { name: 'Error Loading Election' });
  const errorModal = screen.getByRole('alertdialog');
  within(errorModal).getByText('Invalid election file');
  within(errorModal).getByText(errorMessage);

  const closeButton = within(errorModal).getByRole('button', { name: 'Close' });
  userEvent.click(closeButton);
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  expect(history.location.pathname).toEqual(`/`);
});

test('disabled', async () => {
  apiMock.getUser.expectCallWith().resolves(user);
  renderButton({ disabled: true });
  const button = await screen.findByRole('button', { name: 'Load Election' });
  expect(button).toBeDisabled();
});
