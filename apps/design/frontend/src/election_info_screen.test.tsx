import { afterEach, beforeEach, expect, test } from 'vitest';
import userEvent from '@testing-library/user-event';
import { ElectionId, LanguageCode } from '@votingworks/types';
import { Buffer } from 'node:buffer';
import { createMemoryHistory } from 'history';
import { DateWithoutTime, err, ok } from '@votingworks/basics';
import { ElectionInfo } from '@votingworks/design-backend';
import {
  MockApiClient,
  createMockApiClient,
  mockUserFeatures,
  provideApi,
  user,
} from '../test/api_helpers';
import {
  blankElectionRecord,
  electionInfoFromElection,
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
  apiMock.getUser.expectCallWith().resolves(user);
  mockUserFeatures(apiMock);
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
      })
    )
  );
  return history;
}

test('newly created election starts in edit mode', async () => {
  const electionRecord = blankElectionRecord(user.orgId);
  const electionId = electionRecord.election.id;
  apiMock.getElectionInfo
    .expectCallWith({ electionId: electionRecord.election.id })
    .resolves(electionInfoFromElection(electionRecord.election));
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  apiMock.getBallotTemplate
    .expectCallWith({ electionId })
    .resolves('VxDefaultBallot');
  renderScreen(electionRecord.election.id);
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

  // Signature upload inputs are not shown for VxDefaultBallot
  expect(screen.queryByText('Signature')).not.toBeInTheDocument();

  screen.getByRole('button', { name: 'Save' });
  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  screen.getByRole('button', { name: 'Edit' });
});

test('edit and save election', async () => {
  const electionRecord = generalElectionRecord(user.orgId);
  const { election } = electionRecord;
  const electionId = election.id;
  apiMock.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(electionInfoFromElection(electionRecord.election));
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  apiMock.getBallotTemplate
    .expectCallWith({ electionId })
    .resolves('VxDefaultBallot');
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

  // Signature upload inputs are not shown for VxDefaultBallot
  expect(screen.queryByText('Signature')).not.toBeInTheDocument();

  const languageSection = screen.getByLabelText('Ballot Languages');
  const spanishBallotLanguageCheckbox = within(languageSection).getByRole(
    'checkbox',
    { name: 'Spanish' }
  );
  userEvent.click(spanishBallotLanguageCheckbox);

  const updatedElectionInfo: ElectionInfo = {
    electionId,
    title: 'New Title',
    date: new DateWithoutTime('2023-09-06'),
    type: 'primary',
    state: 'New State',
    jurisdiction: 'New County',
    seal: '<svg>updated seal</svg>',
    signatureImage: undefined,
    signatureCaption: undefined,
    languageCodes: [LanguageCode.ENGLISH, LanguageCode.SPANISH],
  };
  apiMock.updateElectionInfo.expectCallWith(updatedElectionInfo).resolves(ok());
  apiMock.getElectionInfo
    .expectCallWith({ electionId })
    .resolves({ ...generalElectionInfo, ...updatedElectionInfo });

  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByRole('button', { name: 'Edit' });
});

test('edit and save election - nhBallotTemplate signature upload', async () => {
  const electionRecord = generalElectionRecord(user.orgId);
  electionRecord.ballotTemplateId = 'NhBallot';
  const { election } = electionRecord;
  const electionId = election.id;
  apiMock.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(electionInfoFromElection(electionRecord.election));
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  apiMock.getBallotTemplate.expectCallWith({ electionId }).resolves('NhBallot');
  renderScreen(electionId);
  await screen.findByRole('heading', { name: 'Election Info' });

  const signatureInput = screen.getByText('Signature').parentElement!;
  expect(within(signatureInput).queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Upload Signature Image')).toBeDisabled();

  const signatureCaptionInput = screen.getByLabelText('Signature Caption');
  expect(signatureCaptionInput).toHaveValue('');
  expect(signatureCaptionInput).toBeDisabled();

  userEvent.click(screen.getByRole('button', { name: 'Edit' }));

  userEvent.upload(
    within(signatureInput).getByLabelText('Upload Signature Image'),
    new File(['<svg>updated signature</svg>'], 'new_signature.svg', {
      type: 'image/svg+xml',
    })
  );
  await waitFor(() =>
    expect(within(signatureInput).getByRole('img')).toHaveAttribute(
      'src',
      `data:image/svg+xml;base64,${Buffer.from(
        '<svg>updated signature</svg>'
      ).toString('base64')}`
    )
  );

  userEvent.type(signatureCaptionInput, 'New Signature Caption');
  expect(signatureCaptionInput).toHaveValue('New Signature Caption');

  const updatedElectionInfo: ElectionInfo = {
    electionId,
    title: election.title,
    date: election.date,
    type: election.type,
    state: election.state,
    jurisdiction: election.county.name,
    seal: election.seal,
    signatureImage: '<svg>updated signature</svg>',
    signatureCaption: 'New Signature Caption',
    languageCodes: [LanguageCode.ENGLISH],
  };
  apiMock.updateElectionInfo.expectCallWith(updatedElectionInfo).resolves(ok());
  apiMock.getElectionInfo
    .expectCallWith({ electionId })
    .resolves({ ...generalElectionInfo, ...updatedElectionInfo });

  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByRole('button', { name: 'Edit' });
});

test('cancel update', async () => {
  const electionRecord = generalElectionRecord(user.orgId);
  const electionId = electionRecord.election.id;
  apiMock.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(electionInfoFromElection(electionRecord.election));
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  apiMock.getBallotTemplate
    .expectCallWith({ electionId })
    .resolves('VxDefaultBallot');
  renderScreen(electionId);
  await screen.findByRole('heading', { name: 'Election Info' });

  userEvent.click(screen.getByRole('button', { name: 'Edit' }));

  const titleInput = screen.getByLabelText('Title');
  userEvent.clear(titleInput);
  userEvent.type(titleInput, 'New Title');

  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(titleInput).toHaveValue(electionRecord.election.title);
});

test('delete election', async () => {
  const electionRecord = generalElectionRecord(user.orgId);
  const electionId = electionRecord.election.id;
  apiMock.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(electionInfoFromElection(electionRecord.election));
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  apiMock.getBallotTemplate
    .expectCallWith({ electionId })
    .resolves('VxDefaultBallot');
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
  const electionRecord = generalElectionRecord(user.orgId);
  const electionId = electionRecord.election.id;
  apiMock.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(electionInfoFromElection(electionRecord.election));
  apiMock.getBallotsFinalizedAt
    .expectCallWith({ electionId })
    .resolves(new Date());
  apiMock.getBallotTemplate
    .expectCallWith({ electionId })
    .resolves('VxDefaultBallot');

  renderScreen(electionId);
  await screen.findByRole('heading', { name: 'Election Info' });

  const editButton = screen.getByRole('button', { name: 'Edit' });
  expect(editButton).toBeDisabled();
});

test('handles duplicate title+date error', async () => {
  const electionRecord = generalElectionRecord(user.orgId);
  const electionId = electionRecord.election.id;
  apiMock.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(electionInfoFromElection(electionRecord.election));
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  apiMock.getBallotTemplate
    .expectCallWith({ electionId })
    .resolves('VxDefaultBallot');
  renderScreen(electionId);
  await screen.findByRole('heading', { name: 'Election Info' });

  userEvent.click(screen.getByRole('button', { name: 'Edit' }));

  apiMock.updateElectionInfo
    .expectCallWith(electionInfoFromElection(electionRecord.election))
    .resolves(err('duplicate-title-and-date'));
  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  const expectedMessage =
    'There is already an election with the same title and date.';
  await screen.findByText(expectedMessage);

  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByText(expectedMessage)).not.toBeInTheDocument();
  userEvent.click(screen.getByRole('button', { name: 'Edit' }));
  expect(screen.queryByText(expectedMessage)).not.toBeInTheDocument();
});
