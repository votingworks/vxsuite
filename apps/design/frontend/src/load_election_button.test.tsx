import { createMemoryHistory } from 'history';
import userEvent from '@testing-library/user-event';
import { File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, test, expect } from 'vitest';
import { err, ok } from '@votingworks/basics';
import { within } from '@testing-library/react';
import {
  MockApiClient,
  org,
  user,
  provideApi,
  createMockApiClient,
  mockUserFeatures,
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
  apiMock.getUser.expectCallWith().resolves(user);
  idFactory.reset();
});

afterEach(() => {
  apiMock.assertComplete();
});

const mockElectionData = 'mock election data';
const mockElectionFile = new File([mockElectionData], 'election.json', {
  type: 'application/json',
});

test('opens file picker for VXF when MS_SEMS_CONVERSION disabled', async () => {
  mockUserFeatures(apiMock, { MS_SEMS_CONVERSION: false });
  const history = renderButton();
  const input = await screen.findByLabelText('Load Election');

  const newId = idFactory.next();
  idFactory.reset();
  apiMock.loadElection
    .expectCallWith({
      newId,
      orgId: org.id,
      upload: {
        format: 'vxf',
        electionFileContents: mockElectionData,
      },
    })
    .resolves(ok(newId));
  userEvent.upload(input, mockElectionFile);
  await waitFor(() =>
    expect(history.location.pathname).toEqual(`/elections/${newId}`)
  );
  global.File = File;
});

test('VXF upload flow in modal', async () => {
  mockUserFeatures(apiMock, { MS_SEMS_CONVERSION: true });
  const history = renderButton();
  const button = await screen.findByRole('button', { name: 'Load Election' });
  userEvent.click(button);

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Load Election' });
  within(modal).getByText('VotingWorks');

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
      orgId: org.id,
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

test('MS SEMS upload flow in modal', async () => {
  mockUserFeatures(apiMock, { MS_SEMS_CONVERSION: true });
  const history = renderButton();
  const button = await screen.findByRole('button', { name: 'Load Election' });
  userEvent.click(button);

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Load Election' });
  // Switch to MS SEMS format
  userEvent.click(within(modal).getByText('VotingWorks'));
  userEvent.click(screen.getByText('Mississippi SEMS'));

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
      orgId: org.id,
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

test('close modal', async () => {
  mockUserFeatures(apiMock, { MS_SEMS_CONVERSION: true });
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
  mockUserFeatures(apiMock, { MS_SEMS_CONVERSION: false });
  const history = renderButton();
  const input = await screen.findByLabelText('Load Election');

  const newId = idFactory.next();
  idFactory.reset();
  const errorMessage = 'mock error message';
  apiMock.loadElection
    .expectCallWith({
      newId,
      orgId: org.id,
      upload: {
        format: 'vxf',
        electionFileContents: mockElectionData,
      },
    })
    .resolves(err(new Error('mock error message')));

  userEvent.upload(input, mockElectionFile);

  const errorModal = await screen.findByRole('alertdialog');
  within(errorModal).getByRole('heading', { name: 'Error Loading Election' });
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
  mockUserFeatures(apiMock);
  renderButton({ disabled: true });
  const button = await screen.findByRole('button', { name: 'Load Election' });
  expect(button).toBeDisabled();
});
