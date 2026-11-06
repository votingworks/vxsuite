import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { assertDefined, DateWithoutTime, err, ok } from '@votingworks/basics';
import type {
  ElectionInfo,
  StateFeaturesConfig,
} from '@votingworks/election-definition-backend';
import { ElectionStringKey, LanguageCode } from '@votingworks/types';
import { Button } from '@votingworks/ui';
import {
  createMockApiClient,
  type MockApiClient,
  provideApi,
} from '../test/api_helpers.js';
import { render, screen, within } from '../test/react_testing_library.js';
import { withRoute } from '../test/routing_helpers.js';
import {
  type ElectionImageInputProps,
  ElectionInfoEditor,
  type ElectionInfoEditorProps,
} from './election_info_editor.js';

const electionId = 'election-1';

const electionInfo: ElectionInfo = {
  electionId,
  type: 'general',
  isMiCombinedBallotPrimary: false,
  date: new DateWithoutTime('2026-11-03'),
  title: 'General Election',
  state: 'Demo State',
  jurisdictionName: 'Demo County',
  seal: '<svg>seal</svg>',
  languageCodes: [LanguageCode.ENGLISH],
};

const blankElectionInfo: ElectionInfo = {
  ...electionInfo,
  title: '',
  jurisdictionName: '',
  seal: '',
};

function ImageInput({
  value,
  onChange,
  disabled,
  label,
}: ElectionImageInputProps & { label: string }): JSX.Element {
  return (
    <input
      aria-label={label}
      type="text"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function SealInput(props: ElectionImageInputProps): JSX.Element {
  return <ImageInput {...props} label="Seal Image" />;
}

function SignatureInput(props: ElectionImageInputProps): JSX.Element {
  return <ImageInput {...props} label="Signature Image" />;
}

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderEditor({
  savedElectionInfo = electionInfo,
  features = {},
  props = {},
}: {
  savedElectionInfo?: ElectionInfo;
  features?: StateFeaturesConfig;
  props?: Partial<ElectionInfoEditorProps>;
} = {}) {
  apiMock.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(savedElectionInfo);
  apiMock.getStateFeatures
    .expectRepeatedCallsWith({ electionId })
    .resolves(features);
  const history = createMemoryHistory({
    initialEntries: [`/elections/${electionId}/info`],
  });
  render(
    provideApi(
      apiMock,
      withRoute(<ElectionInfoEditor electionId={electionId} {...props} />, {
        paramPath: '/elections/:electionId/info',
        history,
      })
    )
  );
  return history;
}

test('newly created election starts in edit mode', async () => {
  renderEditor({
    savedElectionInfo: blankElectionInfo,
    props: { SealInput },
  });

  const titleInput = await screen.findByLabelText('Title');
  expect(titleInput).toHaveValue('');
  expect(titleInput).toBeEnabled();
  expect(screen.getByLabelText('Date')).toHaveValue('2026-11-03');
  expect(screen.getByLabelText('Date')).toBeEnabled();
  const typeInput = screen.getByRole('listbox', { name: 'Type' });
  expect(
    within(typeInput).getByRole('option', { name: 'General', selected: true })
  ).toBeEnabled();
  expect(
    within(typeInput).getByRole('option', { name: 'Primary', selected: false })
  ).toBeEnabled();
  expect(screen.getByLabelText('State')).toHaveValue('Demo State');
  expect(screen.getByLabelText('Jurisdiction')).toHaveValue('');
  expect(screen.getByLabelText('Seal Image')).toBeEnabled();
  expect(screen.queryByText('Signature')).not.toBeInTheDocument();
  expect(screen.queryByText('Ballot Languages')).not.toBeInTheDocument();

  screen.getButton('Save');
  await userEvent.click(screen.getButton('Cancel'));
  screen.getButton('Edit');
});

test('edit and save election info', async () => {
  renderEditor({
    features: { BALLOT_LANGUAGE_CONFIG: true },
    props: { SealInput, SignatureInput },
  });

  const titleInput = await screen.findByLabelText('Title');
  expect(titleInput).toHaveValue('General Election');
  expect(titleInput).toBeDisabled();
  for (const option of within(
    screen.getByRole('listbox', { name: 'Type' })
  ).getAllByRole('option')) {
    expect(option).toBeDisabled();
  }
  expect(screen.getByLabelText('Seal Image')).toBeDisabled();
  expect(screen.getByLabelText('Signature Image')).toBeDisabled();
  expect(screen.getByLabelText('Signature Caption')).toBeDisabled();

  await userEvent.click(screen.getButton('Edit'));

  await userEvent.clear(titleInput);
  await userEvent.type(titleInput, ' New Title ');
  await userEvent.tab();
  expect(titleInput).toHaveValue('New Title');

  const dateInput = screen.getByLabelText('Date');
  await userEvent.clear(dateInput);
  await userEvent.type(dateInput, '2027-09-06');
  expect(dateInput).toHaveValue('2027-09-06');

  await userEvent.click(screen.getByRole('option', { name: 'Primary' }));
  screen.getByRole('option', { name: 'Primary', selected: true });

  const stateInput = screen.getByLabelText('State');
  await userEvent.clear(stateInput);
  await userEvent.type(stateInput, 'New State');

  const jurisdictionInput = screen.getByLabelText('Jurisdiction');
  await userEvent.clear(jurisdictionInput);
  await userEvent.type(jurisdictionInput, 'New County');

  const sealInput = screen.getByLabelText('Seal Image');
  await userEvent.clear(sealInput);
  await userEvent.type(sealInput, 'new seal');

  const signatureInput = screen.getByLabelText('Signature Image');
  await userEvent.type(signatureInput, 'signature');

  await userEvent.type(
    screen.getByLabelText('Signature Caption'),
    'Clerk of Demo County'
  );

  await userEvent.click(screen.getByRole('checkbox', { name: 'Spanish' }));

  const updatedElectionInfo: ElectionInfo = {
    ...electionInfo,
    title: 'New Title',
    date: new DateWithoutTime('2027-09-06'),
    type: 'primary',
    isMiCombinedBallotPrimary: false,
    state: 'New State',
    jurisdictionName: 'New County',
    seal: 'new seal',
    signatureImage: 'signature',
    signatureCaption: 'Clerk of Demo County',
    languageCodes: [LanguageCode.ENGLISH, LanguageCode.SPANISH],
  };
  apiMock.updateElectionInfo.expectCallWith(updatedElectionInfo).resolves(ok());
  apiMock.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(updatedElectionInfo);

  await userEvent.click(screen.getButton('Save'));
  await screen.findButton('Edit');
  expect(titleInput).toHaveValue('New Title');
});

test('keeps a partially typed date as a draft', async () => {
  renderEditor();
  await userEvent.click(await screen.findButton('Edit'));

  const dateInput = screen.getByLabelText('Date');
  await userEvent.clear(dateInput);
  expect(dateInput).toHaveValue('');
});

test('cancel update', async () => {
  renderEditor();
  await userEvent.click(await screen.findButton('Edit'));

  const titleInput = screen.getByLabelText('Title');
  await userEvent.clear(titleInput);
  await userEvent.type(titleInput, 'New Title');
  await userEvent.click(screen.getButton('Cancel'));

  expect(titleInput).toHaveValue('General Election');
});

test('edit is disabled when locked', async () => {
  renderEditor({ props: { isLocked: true } });
  expect(await screen.findButton('Edit')).toBeDisabled();
});

test('elections with external source have limited editable fields', async () => {
  renderEditor({
    savedElectionInfo: { ...electionInfo, externalSource: 'ms-sems' },
    features: { BALLOT_LANGUAGE_CONFIG: true },
    props: { SealInput, SignatureInput },
  });
  await userEvent.click(await screen.findButton('Edit'));

  expect(screen.getByLabelText('Title')).toBeEnabled();
  expect(screen.getByLabelText('State')).toBeEnabled();
  expect(screen.getByLabelText('Jurisdiction')).toBeEnabled();

  expect(screen.getByLabelText('Date')).toBeDisabled();
  for (const option of within(
    screen.getByRole('listbox', { name: 'Type' })
  ).getAllByRole('option')) {
    expect(option).toBeDisabled();
  }
  expect(screen.getByLabelText('Seal Image')).toBeDisabled();
  expect(screen.getByLabelText('Signature Image')).toBeDisabled();
  expect(screen.getByLabelText('Signature Caption')).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: 'Spanish' })).toBeDisabled();
});

test('handles duplicate title and date error', async () => {
  renderEditor();
  await userEvent.click(await screen.findButton('Edit'));

  apiMock.updateElectionInfo
    .expectCallWith(electionInfo)
    .resolves(err('duplicate-title-and-date'));
  await userEvent.click(screen.getButton('Save'));
  const expectedMessage =
    'There is already an election with the same title and date.';
  await screen.findByText(expectedMessage);

  await userEvent.click(screen.getButton('Cancel'));
  expect(screen.queryByText(expectedMessage)).not.toBeInTheDocument();
});

test('election type selector with combined ballot primaries', async () => {
  renderEditor({ features: { COMBINED_BALLOT_PRIMARIES: true } });

  const typeInput = await screen.findByRole('listbox', { name: 'Type' });
  within(typeInput).getByRole('option', { name: 'General', selected: true });

  await userEvent.click(screen.getButton('Edit'));
  await userEvent.click(
    within(typeInput).getByRole('option', { name: 'Open Primary' })
  );
  const openPrimaryInfo: ElectionInfo = {
    ...electionInfo,
    type: 'primary',
    isMiCombinedBallotPrimary: true,
  };
  apiMock.updateElectionInfo.expectCallWith(openPrimaryInfo).resolves(ok());
  apiMock.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(openPrimaryInfo);
  await userEvent.click(screen.getButton('Save'));
  await screen.findByRole('option', { name: 'Open Primary', selected: true });

  await userEvent.click(screen.getButton('Edit'));
  await userEvent.click(
    within(typeInput).getByRole('option', { name: 'Closed Primary' })
  );
  const closedPrimaryInfo: ElectionInfo = {
    ...openPrimaryInfo,
    isMiCombinedBallotPrimary: false,
  };
  apiMock.updateElectionInfo.expectCallWith(closedPrimaryInfo).resolves(ok());
  apiMock.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(closedPrimaryInfo);
  await userEvent.click(screen.getButton('Save'));
  await screen.findByRole('option', { name: 'Closed Primary', selected: true });
});

test('renders footer actions and children', async () => {
  const onPress = vi.fn();
  renderEditor({
    props: {
      footerActions: <Button onPress={onPress}>Footer Action</Button>,
      children: <div>Side Panel</div>,
    },
  });

  await userEvent.click(await screen.findButton('Footer Action'));
  expect(onPress).toHaveBeenCalled();
  screen.getByText('Side Panel');
});

test('links to audio screens', async () => {
  const history = renderEditor({
    features: { AUDIO_ENABLED: true },
    props: {
      audioRoutes: {
        audioScreenUrl: (stringKey) =>
          `/elections/${electionId}/info/audio/${stringKey}`,
      },
    },
  });

  const titleInput = await screen.findByDisplayValue('General Election');
  await userEvent.click(
    within(assertDefined(titleInput.closest('label'))).getButton(
      'Preview or Edit Audio'
    )
  );
  expect(history.location.pathname).toEqual(
    `/elections/${electionId}/info/audio/${ElectionStringKey.ELECTION_TITLE}`
  );
});

test('reports editing changes', async () => {
  const onEditingChange = vi.fn();
  renderEditor({ props: { onEditingChange } });

  await userEvent.click(await screen.findButton('Edit'));
  expect(onEditingChange).toHaveBeenLastCalledWith(true);

  await userEvent.click(screen.getButton('Cancel'));
  expect(onEditingChange).toHaveBeenLastCalledWith(false);

  await userEvent.click(screen.getButton('Edit'));
  apiMock.updateElectionInfo.expectCallWith(electionInfo).resolves(ok());
  apiMock.getElectionInfo.expectCallWith({ electionId }).resolves(electionInfo);
  await userEvent.click(screen.getButton('Save'));
  await screen.findButton('Edit');
  expect(onEditingChange).toHaveBeenLastCalledWith(false);
  expect(onEditingChange).toHaveBeenCalledTimes(4);
});
