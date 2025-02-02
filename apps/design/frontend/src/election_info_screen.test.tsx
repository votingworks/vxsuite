import userEvent from '@testing-library/user-event';
import { ElectionId } from '@votingworks/types';
import { Buffer } from 'node:buffer';
import { createMemoryHistory } from 'history';
import { DateWithoutTime } from '@votingworks/basics';
import { ElectionInfo } from '@votingworks/design-backend';
import {
  MockApiClient,
  createMockApiClient,
  provideApi,
} from '../test/api_helpers';
import {
  blankElectionInfo,
  blankElectionRecord,
  generalElectionInfo,
  generalElectionRecord,
} from '../test/fixtures';
import { render, screen, waitFor, within } from '../test/react_testing_library';
import { withRoute } from '../test/routing_helpers';
import { ElectionInfoScreen } from './election_info_screen';
import { routes } from './routes';

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderScreen(electionId: ElectionId) {
  const { path } = routes.election(electionId).electionInfo;
  const history = createMemoryHistory({ initialEntries: [path] });
  render(
    provideApi(
      apiMock,
      withRoute(<ElectionInfoScreen />, {
        paramPath: routes.election(':electionId').electionInfo.path,
        history,
      }),
      electionId
    )
  );
  return history;
}

test('newly created election starts in edit mode', async () => {
  const electionId = blankElectionRecord.election.id;
  apiMock.getElection
    .expectCallWith({ electionId })
    .resolves(blankElectionRecord);
  apiMock.getElectionInfo
    .expectCallWith({ electionId: blankElectionRecord.election.id })
    .resolves(blankElectionInfo);
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  renderScreen(blankElectionRecord.election.id);
  await screen.findByRole('heading', { name: 'Election Info' });

  const titleInput = screen.getByLabelText('Title');
  expect(titleInput).toHaveValue('');
  expect(titleInput).toBeEnabled();

  const dateInput = screen.getByLabelText('Date');
  expect(dateInput).toHaveValue(DateWithoutTime.today().toISOString());
  expect(dateInput).toBeEnabled();

  const typeInput = screen.getByRole('listbox', { name: 'Type' });
  expect(
    within(typeInput).getByRole('option', { name: 'General', selected: true })
  ).toBeEnabled();
  expect(
    within(typeInput).getByRole('option', { name: 'Primary', selected: false })
  ).toBeEnabled();

  const stateInput = screen.getByLabelText('State');
  expect(stateInput).toHaveValue('');
  expect(stateInput).toBeEnabled();

  const jurisdictionInput = screen.getByLabelText('Jurisdiction');
  expect(jurisdictionInput).toHaveValue('');
  expect(jurisdictionInput).toBeEnabled();

  const sealInput = screen.getByText('Seal').parentElement!;
  expect(within(sealInput).queryByRole('img')).not.toBeInTheDocument();
  expect(within(sealInput).getByLabelText('Upload Seal Image')).toBeEnabled();

  screen.getByRole('button', { name: 'Save' });
  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  screen.getByRole('button', { name: 'Edit' });
  screen.getByRole('button', { name: 'Delete Election' });
});

test('edit and save election', async () => {
  const { election } = generalElectionRecord;
  const electionId = election.id;
  apiMock.getElection
    .expectCallWith({ electionId })
    .resolves(generalElectionRecord);
  apiMock.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(generalElectionInfo);
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  renderScreen(electionId);
  await screen.findByRole('heading', { name: 'Election Info' });

  const titleInput = screen.getByLabelText('Title');
  expect(titleInput).toHaveValue(election.title);
  expect(titleInput).toBeDisabled();

  const dateInput = screen.getByLabelText('Date');
  expect(dateInput).toHaveValue(election.date.toISOString());
  expect(dateInput).toBeDisabled();

  const typeInput = screen.getByRole('listbox', { name: 'Type' });
  within(typeInput).getByRole('option', { name: 'General', selected: true });
  for (const option of within(typeInput).getAllByRole('option')) {
    expect(option).toBeDisabled();
  }

  const stateInput = screen.getByLabelText('State');
  expect(stateInput).toHaveValue(election.state);
  expect(stateInput).toBeDisabled();

  const jurisdictionInput = screen.getByLabelText('Jurisdiction');
  expect(jurisdictionInput).toHaveValue(election.county.name);
  expect(jurisdictionInput).toBeDisabled();

  const sealInput = screen.getByText('Seal').parentElement!;
  expect(within(sealInput).getByRole('img')).toHaveAttribute(
    'src',
    `data:image/svg+xml;base64,${Buffer.from(election.seal).toString('base64')}`
  );
  expect(within(sealInput).getByLabelText('Upload Seal Image')).toBeDisabled();

  userEvent.click(screen.getByRole('button', { name: 'Edit' }));

  userEvent.clear(titleInput);
  userEvent.type(titleInput, 'New Title');
  expect(titleInput).toHaveValue('New Title');

  userEvent.type(dateInput, '2023-09-06');
  expect(dateInput).toHaveValue('2023-09-06');

  userEvent.click(within(typeInput).getByRole('option', { name: 'Primary' }));
  within(typeInput).getByRole('option', { name: 'General', selected: false });
  within(typeInput).getByRole('option', { name: 'Primary', selected: true });

  userEvent.clear(stateInput);
  userEvent.type(stateInput, 'New State');
  expect(stateInput).toHaveValue('New State');

  userEvent.clear(jurisdictionInput);
  userEvent.type(jurisdictionInput, 'New County');
  expect(jurisdictionInput).toHaveValue('New County');

  userEvent.upload(
    within(sealInput).getByLabelText('Upload Seal Image'),
    new File(['<svg>updated seal</svg>'], 'new_seal.svg', {
      type: 'image/svg+xml',
    })
  );
  await waitFor(() =>
    expect(within(sealInput).getByRole('img')).toHaveAttribute(
      'src',
      `data:image/svg+xml;base64,${Buffer.from(
        '<svg>updated seal</svg>'
      ).toString('base64')}`
    )
  );

  const updatedElectionInfo: ElectionInfo = {
    electionId,
    title: 'New Title',
    date: new DateWithoutTime('2023-09-06'),
    type: 'primary',
    state: 'New State',
    jurisdiction: 'New County',
    seal: '<svg>updated seal</svg>',
  };
  apiMock.updateElectionInfo.expectCallWith(updatedElectionInfo).resolves();
  apiMock.getElection.expectCallWith({ electionId }).resolves({
    ...generalElectionRecord,
    election: {
      ...generalElectionRecord.election,
      type: updatedElectionInfo.type,
      title: updatedElectionInfo.title,
      date: updatedElectionInfo.date,
      state: updatedElectionInfo.state,
      seal: updatedElectionInfo.seal,
      county: {
        id: generalElectionRecord.election.county.id,
        name: updatedElectionInfo.jurisdiction,
      },
    },
  });
  apiMock.getElectionInfo
    .expectCallWith({ electionId })
    .resolves({ ...generalElectionInfo, ...updatedElectionInfo });

  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByRole('button', { name: 'Edit' });
});

test('cancel update', async () => {
  const electionId = generalElectionRecord.election.id;
  apiMock.getElection
    .expectCallWith({ electionId })
    .resolves(generalElectionRecord);
  apiMock.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(generalElectionInfo);
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  renderScreen(electionId);
  await screen.findByRole('heading', { name: 'Election Info' });

  userEvent.click(screen.getByRole('button', { name: 'Edit' }));

  const titleInput = screen.getByLabelText('Title');
  userEvent.clear(titleInput);
  userEvent.type(titleInput, 'New Title');

  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(titleInput).toHaveValue(generalElectionRecord.election.title);
});

test('delete election', async () => {
  const electionId = generalElectionRecord.election.id;
  apiMock.getElection
    .expectCallWith({ electionId })
    .resolves(generalElectionRecord);
  apiMock.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(generalElectionInfo);
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  const history = renderScreen(electionId);
  await screen.findByRole('heading', { name: 'Election Info' });

  apiMock.deleteElection.expectCallWith({ electionId }).resolves();

  userEvent.click(screen.getByRole('button', { name: 'Delete Election' }));
  await screen.findByRole('heading', { name: 'Delete Election' });
  screen.getByText(
    'Are you sure you want to delete this election? This action cannot be undone.'
  );
  userEvent.click(screen.getByRole('button', { name: 'Delete' }));

  // Redirects to elections list
  await waitFor(() =>
    expect(history.location.pathname).toEqual(routes.root.path)
  );
});

test('edit election disabled when ballots are finalized', async () => {
  const electionId = generalElectionRecord.election.id;
  apiMock.getElection
    .expectCallWith({ electionId })
    .resolves(generalElectionRecord);
  apiMock.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(generalElectionInfo);
  apiMock.getBallotsFinalizedAt
    .expectCallWith({ electionId })
    .resolves(new Date());

  renderScreen(electionId);
  await screen.findByRole('heading', { name: 'Election Info' });

  const editButton = screen.getByRole('button', { name: 'Edit' });
  expect(editButton).toBeDisabled();
});
