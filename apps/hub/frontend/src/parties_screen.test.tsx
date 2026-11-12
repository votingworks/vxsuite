import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { makeIdFactory } from '@votingworks/test-utils';
import { createMemoryHistory } from 'history';
import { userEvent } from '@testing-library/user-event';
import {
  DEFAULT_SYSTEM_SETTINGS,
  type ElectionId,
  ElectionStringKey,
  type Party,
} from '@votingworks/types';
import { assertDefined, ok } from '@votingworks/basics';
import { readElectionGeneral } from '@votingworks/fixtures';
import {
  type MockApiClient,
  createMockApiClient,
  mockStateFeatures,
  mockUserFeatures,
  provideApi,
  user,
} from '../test/api_helpers.js';
import { electionInfoFromElection } from '../test/fixtures.js';
import { render, screen, within } from '../test/react_testing_library.js';
import { withRoute } from '../test/routing_helpers.js';
import { routes } from './routes.js';
import { PartiesScreen } from './parties_screen.js';
import { PartyAudioPanel } from './party_audio_panel.js';

vi.mock('./party_audio_panel.js');
const MockAudioPanel = vi.mocked(PartyAudioPanel);
const MOCK_AUDIO_PANEL_ID = 'MockPartyAudioPanel';

let apiMock: MockApiClient;

const idFactory = makeIdFactory();
function renderScreen(electionId: ElectionId) {
  const { path } = routes.election(electionId).parties.root;
  const history = createMemoryHistory({ initialEntries: [path] });

  render(
    provideApi(
      apiMock,
      withRoute(<PartiesScreen />, {
        history,
        paramPath: routes.election(':electionId').parties.root.path,
        path,
      })
    )
  );

  return history;
}

const election = readElectionGeneral();
const electionId = election.id;
const partyRoutes = routes.election(electionId).parties;

beforeEach(() => {
  apiMock = createMockApiClient();
  idFactory.reset();
  apiMock.getUser.expectCallWith().resolves(user);
  mockUserFeatures(apiMock);

  apiMock.getStateFeatures
    .expectOptionalRepeatedCallsWith({ electionId })
    .resolves({});

  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(DEFAULT_SYSTEM_SETTINGS);
  apiMock.getElectionInfo
    .expectRepeatedCallsWith({ electionId })
    .resolves(electionInfoFromElection(election));

  MockAudioPanel.mockReturnValue(<div data-testid={MOCK_AUDIO_PANEL_ID} />);
});

afterEach(() => {
  apiMock.assertComplete();
});

test('adding a parties to empty list', async () => {
  const newParty1: Party = {
    id: idFactory.next(),
    name: 'New Party 1',
    fullName: 'New Party Full Name 1',
    abbrev: 'NP1',
  };
  const newParty2: Party = {
    id: idFactory.next(),
    name: 'New Party 2',
    fullName: 'New Party Full Name 2',
    abbrev: 'NP2',
  };

  apiMock.listParties.expectCallWith({ electionId }).resolves([]);

  const history = renderScreen(electionId);

  await screen.findByRole('heading', { name: 'Parties' });
  await screen.findByText(
    "You haven't added any parties to this election yet."
  );
  expect(screen.getButton('Edit Parties')).toBeDisabled();

  await userEvent.click(screen.getByRole('button', { name: 'Add Party' }));
  await screen.findButton('Save');
  expect(history.location.pathname).toEqual(`${partyRoutes.root.path}/edit`);

  // Add first party:
  {
    const inputs = getInputsByRow(0);
    await userEvent.type(inputs[0]!, newParty1.fullName);
    await userEvent.type(inputs[1]!, newParty1.name);
    await userEvent.type(inputs[2]!, newParty1.abbrev);
  }

  // Add second party:
  await userEvent.click(screen.getButton('Add Party'));
  {
    const inputs = getInputsByRow(1);
    await userEvent.type(inputs[0]!, newParty2.fullName);
    await userEvent.type(inputs[1]!, newParty2.name);
    await userEvent.type(inputs[2]!, newParty2.abbrev);
  }

  // Add and delete third party:
  await userEvent.click(screen.getButton('Add Party'));
  {
    const inputs = getInputsByRow(2);
    await userEvent.type(inputs[0]!, 'Temporary Party');
    await userEvent.click(screen.getButton('Delete Party Temporary Party'));
  }

  const newParties = [newParty1, newParty2];
  expectPartyInputs(newParties);

  // Save and verify:
  expectUpdate(apiMock, { electionId, newParties }).resolves(ok());
  apiMock.listParties.expectCallWith({ electionId }).resolves(newParties);

  await userEvent.click(screen.getButton('Save'));

  await screen.findButton('Edit Parties');
  expectPartyInputs(newParties);
  expect(history.location.pathname).toEqual(partyRoutes.root.path);
});

test('editing or adding a party is disabled when ballots are finalized', async () => {
  apiMock.getBallotsFinalizedAt.reset();
  apiMock.getBallotsFinalizedAt
    .expectCallWith({ electionId })
    .resolves(new Date());
  apiMock.listParties.expectCallWith({ electionId }).resolves(election.parties);

  renderScreen(electionId);

  await screen.findByDisplayValue(election.parties[0]!.name);
  expect(screen.getButton('Add Party')).toBeDisabled();
  expect(screen.queryButton('Edit Parties')).not.toBeInTheDocument();
  expect(screen.queryButton('Save')).not.toBeInTheDocument();
  expect(screen.queryButton('Cancel')).not.toBeInTheDocument();
});

test('audio editing', async () => {
  const { parties } = election;
  apiMock.listParties.expectCallWith({ electionId }).resolves(parties);
  mockStateFeatures(apiMock, electionId, { AUDIO_ENABLED: true });

  const history = renderScreen(electionId);
  const editButton = await screen.findButton('Edit Parties');

  async function assertAudioLink(
    partyId: string,
    inputValue: string,
    key: ElectionStringKey
  ) {
    const input = screen.getByDisplayValue(inputValue);
    const container = assertDefined(input.parentElement);
    const button = within(container).getButton(/preview or edit audio/i);

    await userEvent.click(button);

    await screen.findByTestId(MOCK_AUDIO_PANEL_ID);
    expect(history.location.pathname).toEqual(
      `${partyRoutes.root.path}/audio/${key}/${partyId}`
    );
  }

  // Expect audio buttons for each full name and short name input:
  expect(await screen.findAllButtons(/preview or edit audio/i)).toHaveLength(
    election.parties.length * 2
  );

  // Audio buttons should link to the right routes:
  const Key = ElectionStringKey;
  for (const party of parties) {
    await assertAudioLink(party.id, party.fullName, Key.PARTY_FULL_NAME);
    await assertAudioLink(party.id, party.name, Key.PARTY_NAME);
  }

  // Switching to "edit" mode should close the audio panel:
  await userEvent.click(editButton);
  expect(screen.queryByTestId(MOCK_AUDIO_PANEL_ID)).not.toBeInTheDocument();
  expect(screen.queryButton(/preview or edit audio/i)).not.toBeInTheDocument();
});

function expectPartyInputs(parties: readonly Party[]) {
  const inputs = screen.getAllByRole('textbox');
  const inputValues = inputs.map((i) => (i as HTMLInputElement).value);
  const partyValues = parties.flatMap((p) => [p.fullName, p.name, p.abbrev]);
  expect(inputValues).toEqual(partyValues);
}

function expectUpdate(
  mockApi: MockApiClient,
  input: {
    electionId: string;
    newParties?: Party[];
    updatedParties?: Party[];
    deletedPartyIds?: string[];
  }
) {
  return mockApi.updateParties.expectCallWith({
    newParties: [],
    deletedPartyIds: [],
    updatedParties: [],
    ...input,
  });
}

function getInputsByRow(rowIndex: number) {
  const inputsPerRow = 3;
  const inputIndex = rowIndex * inputsPerRow;

  return screen.getAllByRole('textbox').slice(inputIndex, inputIndex + 3);
}
