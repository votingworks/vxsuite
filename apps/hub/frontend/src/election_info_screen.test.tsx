import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import {
  DEFAULT_SYSTEM_SETTINGS,
  type ElectionId,
  ElectionStringKey,
  LanguageCode,
} from '@votingworks/types';
import { Buffer } from 'node:buffer';
import { createMemoryHistory } from 'history';
import { assertDefined, DateWithoutTime, ok } from '@votingworks/basics';
import type { ElectionInfo } from '@votingworks/hub-backend';
import {
  type MockApiClient,
  createMockApiClient,
  mockUserFeatures,
  jurisdiction,
  provideApi,
  user,
  mockStateFeatures,
} from '../test/api_helpers.js';
import {
  blankElectionRecord,
  electionInfoFromElection,
  electionInfoFromRecord,
  generalElectionRecord,
} from '../test/fixtures.js';
import {
  render,
  screen,
  waitFor,
  within,
} from '../test/react_testing_library.js';
import { withRoute } from '../test/routing_helpers.js';
import { ElectionInfoScreen } from './election_info_screen.js';
import { routes } from './routes.js';
import { ElectionInfoAudioPanel } from './election_info_audio_panel.js';

vi.mock('./election_info_audio_panel.js');
const MockAudioPanel = vi.mocked(ElectionInfoAudioPanel);
const MOCK_AUDIO_PANEL_ID = 'MockElectionInfoAudioPanel';

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
  apiMock.getUser.expectCallWith().resolves(user);
  mockUserFeatures(apiMock);

  MockAudioPanel.mockReturnValue(<div data-testid={MOCK_AUDIO_PANEL_ID} />);
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderScreen(electionId: ElectionId) {
  const { path } = routes.election(electionId).electionInfo.root;
  const history = createMemoryHistory({ initialEntries: [path] });
  render(
    provideApi(
      apiMock,
      withRoute(<ElectionInfoScreen />, {
        paramPath: routes.election(':electionId').electionInfo.root.path,
        history,
      })
    )
  );
  return history;
}

test('newly created election starts in edit mode', async () => {
  const electionRecord = blankElectionRecord(jurisdiction);
  const electionId = electionRecord.election.id;
  mockStateFeatures(apiMock, electionId);
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(DEFAULT_SYSTEM_SETTINGS);
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
  expect(stateInput).toHaveValue(electionRecord.election.state);
  expect(stateInput).toBeEnabled();

  const jurisdictionInput = screen.getByLabelText('Jurisdiction');
  expect(jurisdictionInput).toHaveValue(
    electionRecord.election.jurisdiction.name
  );
  expect(jurisdictionInput).toBeEnabled();

  const sealInput = screen.getByText('Seal').parentElement!;
  expect(within(sealInput).queryByRole('img')).not.toBeInTheDocument();
  expect(within(sealInput).getByLabelText('Upload Seal Image')).toBeEnabled();

  // Signature upload inputs are not shown for VxDefaultBallot
  expect(screen.queryByText('Signature')).not.toBeInTheDocument();

  screen.getByRole('button', { name: 'Save' });
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  screen.getByRole('button', { name: 'Edit' });
});

test('edit and save election', async () => {
  const electionRecord = generalElectionRecord(jurisdiction.id);
  const { election } = electionRecord;
  const electionId = election.id;
  mockStateFeatures(apiMock, electionId, { BALLOT_LANGUAGE_CONFIG: true });
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(DEFAULT_SYSTEM_SETTINGS);
  apiMock.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(electionInfoFromRecord(electionRecord));
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
  expect(jurisdictionInput).toHaveValue(election.jurisdiction.name);
  expect(jurisdictionInput).toBeDisabled();

  const sealInput = screen.getByText('Seal').parentElement!;
  expect(within(sealInput).getByRole('img')).toHaveAttribute(
    'src',
    `data:image/svg+xml;base64,${Buffer.from(election.seal).toString('base64')}`
  );
  expect(within(sealInput).getByLabelText('Upload Seal Image')).toBeDisabled();

  await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

  await userEvent.clear(titleInput);
  await userEvent.type(titleInput, 'New Title');
  expect(titleInput).toHaveValue('New Title');

  await userEvent.clear(dateInput);
  await userEvent.type(dateInput, '2023-09-06');
  expect(dateInput).toHaveValue('2023-09-06');

  await userEvent.click(
    within(typeInput).getByRole('option', { name: 'Primary' })
  );
  within(typeInput).getByRole('option', { name: 'General', selected: false });
  within(typeInput).getByRole('option', { name: 'Primary', selected: true });

  await userEvent.clear(stateInput);
  await userEvent.type(stateInput, 'New State');
  expect(stateInput).toHaveValue('New State');

  await userEvent.clear(jurisdictionInput);
  await userEvent.type(jurisdictionInput, 'New County');
  expect(jurisdictionInput).toHaveValue('New County');

  await userEvent.upload(
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
  await userEvent.click(spanishBallotLanguageCheckbox);

  const updatedElectionInfo: ElectionInfo = {
    jurisdictionId: electionRecord.jurisdictionId,
    electionId,
    title: 'New Title',
    date: new DateWithoutTime('2023-09-06'),
    type: 'primary',
    isMiCombinedBallotPrimary: false,
    state: 'New State',
    jurisdictionName: 'New County',
    seal: '<svg>updated seal</svg>',
    signatureImage: undefined,
    signatureCaption: undefined,
    languageCodes: [LanguageCode.ENGLISH, LanguageCode.SPANISH],
  };
  apiMock.updateElectionInfo.expectCallWith(updatedElectionInfo).resolves(ok());
  apiMock.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(updatedElectionInfo);

  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByRole('button', { name: 'Edit' });
});

test('edit and save election - nhBallotTemplate signature upload', async () => {
  const electionRecord = generalElectionRecord(jurisdiction.id);
  electionRecord.ballotTemplateId = 'NhBallot';
  const { election } = electionRecord;
  const electionId = election.id;
  mockStateFeatures(apiMock, electionId);
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(DEFAULT_SYSTEM_SETTINGS);
  apiMock.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(electionInfoFromRecord(electionRecord));
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

  await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

  await userEvent.upload(
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

  await userEvent.type(signatureCaptionInput, 'New Signature Caption');
  expect(signatureCaptionInput).toHaveValue('New Signature Caption');

  const updatedElectionInfo: ElectionInfo = {
    jurisdictionId: electionRecord.jurisdictionId,
    electionId,
    title: election.title,
    date: election.date,
    type: election.type,
    isMiCombinedBallotPrimary: false,
    state: election.state,
    jurisdictionName: election.jurisdiction.name,
    seal: election.seal,
    signatureImage: '<svg>updated signature</svg>',
    signatureCaption: 'New Signature Caption',
    languageCodes: [LanguageCode.ENGLISH],
  };
  apiMock.updateElectionInfo.expectCallWith(updatedElectionInfo).resolves(ok());
  apiMock.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(updatedElectionInfo);

  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByRole('button', { name: 'Edit' });
});

test('shows signature input for NhStateBallot template', async () => {
  const electionRecord = generalElectionRecord(jurisdiction.id);
  electionRecord.ballotTemplateId = 'NhStateBallot';
  const { election } = electionRecord;
  const electionId = election.id;
  mockStateFeatures(apiMock, electionId);
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(DEFAULT_SYSTEM_SETTINGS);
  apiMock.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(electionInfoFromRecord(electionRecord));
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  apiMock.getBallotTemplate
    .expectCallWith({ electionId })
    .resolves('NhStateBallot');
  renderScreen(electionId);

  await screen.findByRole('heading', { name: 'Election Info' });
  screen.getByText('Signature');
  screen.getByLabelText('Upload Signature Image');
  screen.getByLabelText('Signature Caption');
});

test('delete election', async () => {
  const electionRecord = generalElectionRecord(jurisdiction.id);
  const electionId = electionRecord.election.id;
  mockStateFeatures(apiMock, electionId);
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(DEFAULT_SYSTEM_SETTINGS);
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

  await userEvent.click(
    screen.getByRole('button', { name: 'Delete Election' })
  );
  await screen.findByRole('heading', { name: 'Delete Election' });
  screen.getByText(
    'Are you sure you want to delete this election? This action cannot be undone.'
  );
  await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

  // Redirects to elections list
  await waitFor(() =>
    expect(history.location.pathname).toEqual(routes.root.path)
  );
});

test('edit election disabled when ballots are finalized', async () => {
  const electionRecord = generalElectionRecord(jurisdiction.id);
  const electionId = electionRecord.election.id;
  mockStateFeatures(apiMock, electionId);
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(DEFAULT_SYSTEM_SETTINGS);
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

describe('audio editing', () => {
  const { election } = generalElectionRecord(jurisdiction.id);
  const electionId = election.id;

  interface AudioEnabledInputSpec {
    inputValue: string;
    stringKey: ElectionStringKey;
  }

  const Key = ElectionStringKey;
  for (const spec of [
    {
      inputValue: election.jurisdiction.name,
      stringKey: Key.JURISDICTION_NAME,
    },
    { inputValue: election.title, stringKey: Key.ELECTION_TITLE },
    { inputValue: election.state, stringKey: Key.STATE_NAME },
  ] as AudioEnabledInputSpec[]) {
    test(`configures audio edit button for ${spec.stringKey}`, async () => {
      mockStateFeatures(apiMock, electionId, { AUDIO_ENABLED: true });

      apiMock.getSystemSettings
        .expectCallWith({ electionId })
        .resolves(DEFAULT_SYSTEM_SETTINGS);

      apiMock.getElectionInfo
        .expectCallWith({ electionId })
        .resolves(electionInfoFromElection(election));

      apiMock.getBallotsFinalizedAt
        .expectCallWith({ electionId })
        .resolves(null);

      apiMock.getBallotTemplate
        .expectCallWith({ electionId })
        .resolves('VxDefaultBallot');

      const history = renderScreen(electionId);

      const input = await screen.findByDisplayValue(spec.inputValue);
      const inputGroup = assertDefined(input.closest('label'));
      const button = within(inputGroup).getButton(/preview or edit audio/i);

      await userEvent.click(button);

      await screen.findByTestId(MOCK_AUDIO_PANEL_ID);
      expect(history.location.pathname).toEqual(
        routes.election(electionId).electionInfo.audio({
          stringKey: spec.stringKey,
        })
      );
    });
  }

  test('editing closes the audio panel', async () => {
    mockStateFeatures(apiMock, electionId, { AUDIO_ENABLED: true });
    apiMock.getSystemSettings
      .expectCallWith({ electionId })
      .resolves(DEFAULT_SYSTEM_SETTINGS);
    apiMock.getElectionInfo
      .expectCallWith({ electionId })
      .resolves(electionInfoFromElection(election));
    apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
    apiMock.getBallotTemplate
      .expectCallWith({ electionId })
      .resolves('VxDefaultBallot');
    const history = renderScreen(electionId);

    const input = await screen.findByDisplayValue(election.title);
    await userEvent.click(
      within(assertDefined(input.closest('label'))).getButton(
        /preview or edit audio/i
      )
    );
    await screen.findByTestId(MOCK_AUDIO_PANEL_ID);

    await userEvent.click(screen.getButton('Edit'));
    expect(history.location.pathname).toEqual(
      routes.election(electionId).electionInfo.root.path
    );
    expect(screen.queryByTestId(MOCK_AUDIO_PANEL_ID)).not.toBeInTheDocument();
  });
});
