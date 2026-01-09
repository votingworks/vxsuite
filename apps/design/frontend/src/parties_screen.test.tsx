import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryHistory } from 'history';
import userEvent from '@testing-library/user-event';
import {
  DEFAULT_SYSTEM_SETTINGS,
  ElectionId,
  ElectionStringKey,
  Party,
} from '@votingworks/types';
import { assertDefined, err, ok } from '@votingworks/basics';
import { readElectionGeneral } from '@votingworks/fixtures';
import { DuplicatePartyError } from '@votingworks/design-backend';
import {
  MockApiClient,
  createMockApiClient,
  mockStateFeatures,
  mockUserFeatures,
  provideApi,
  user,
} from '../test/api_helpers';
import { electionInfoFromElection } from '../test/fixtures';
import { render, screen, within } from '../test/react_testing_library';
import { withRoute } from '../test/routing_helpers';
import { routes } from './routes';
import { makeIdFactory } from '../test/id_helpers';
import { PartiesScreen } from './parties_screen';
import { PartyAudioPanel } from './party_audio_panel';

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

  mockStateFeatures(apiMock, electionId);
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

  userEvent.click(screen.getByRole('button', { name: 'Add Party' }));
  await screen.findButton('Save');
  expect(history.location.pathname).toEqual(partyRoutes.edit.path);

  // Add first party:
  {
    const inputs = getInputsByRow(0);
    userEvent.type(inputs[0], newParty1.fullName);
    userEvent.type(inputs[1], newParty1.name);
    userEvent.type(inputs[2], newParty1.abbrev);
  }

  // Add second party:
  userEvent.click(screen.getButton('Add Party'));
  {
    const inputs = getInputsByRow(1);
    userEvent.type(inputs[0], newParty2.fullName);
    userEvent.type(inputs[1], newParty2.name);
    userEvent.type(inputs[2], newParty2.abbrev);
  }

  // Add and delete third party:
  userEvent.click(screen.getButton('Add Party'));
  {
    const inputs = getInputsByRow(2);
    userEvent.type(inputs[0], 'Temporary Party');
    userEvent.click(screen.getButton('Delete Party Temporary Party'));
  }

  const newParties = [newParty1, newParty2];
  expectPartyInputs(newParties);

  // Save and verify:
  expectUpdate(apiMock, { electionId, newParties }).resolves(ok());
  apiMock.listParties.expectCallWith({ electionId }).resolves(newParties);

  userEvent.click(screen.getButton('Save'));

  await screen.findButton('Edit Parties');
  expectPartyInputs(newParties);
  expect(history.location.pathname).toEqual(partyRoutes.root.path);
});

test('editing existing party list', async () => {
  const savedParties: Party[] = [
    { id: 'p1', abbrev: '1', fullName: 'party 1', name: 'p1' },
    { id: 'p2', abbrev: '2', fullName: 'party 2', name: 'p2' },
    { id: 'p3', abbrev: '3', fullName: 'party 3', name: 'p3' },
  ];

  const preservedParty = savedParties[0];
  const deletedParty = savedParties[1];
  const updatedParty: Party = {
    id: savedParties[2].id,
    abbrev: '3 (edit)',
    fullName: 'party 3 (edit)',
    name: 'p3 (edit)',
  };
  const newParty: Party = {
    id: idFactory.next(),
    fullName: 'new party',
    abbrev: 'n',
    name: 'new',
  };

  apiMock.listParties.expectCallWith({ electionId }).resolves(savedParties);

  renderScreen(electionId);

  await screen.findButton('Edit Parties');
  expectPartyInputs(savedParties);

  userEvent.click(screen.getButton('Edit Parties'));
  expect(screen.queryButton('Edit Parties')).not.toBeInTheDocument();

  // Delete second saved party:
  userEvent.click(screen.getButton(`Delete Party ${deletedParty.fullName}`));
  expectPartyInputs([savedParties[0], savedParties[2]]);

  // Update third saved party (now at row index 1):
  {
    const inputs = getInputsByRow(1);
    userEvent.type(inputs[0], ' (edit)');
    userEvent.type(inputs[1], ' (edit)');
    userEvent.type(inputs[2], ' (edit)');
  }

  // Add new party:
  userEvent.click(screen.getButton('Add Party'));
  {
    const inputs = getInputsByRow(2);
    userEvent.type(inputs[0], newParty.fullName);
    userEvent.type(inputs[1], newParty.name);
    userEvent.type(inputs[2], newParty.abbrev);
  }

  const updatedList = [preservedParty, updatedParty, newParty];
  expectPartyInputs(updatedList);

  expectUpdate(apiMock, {
    electionId,
    deletedPartyIds: [deletedParty.id],
    newParties: [newParty],
    updatedParties: [preservedParty, updatedParty],
  }).resolves(ok());

  apiMock.listParties.expectCallWith({ electionId }).resolves(updatedList);

  userEvent.click(screen.getButton('Save'));
  await screen.findButton('Edit Parties');
  expectPartyInputs(updatedList);
});

test('editing or adding a party is disabled when ballots are finalized', async () => {
  apiMock.getBallotsFinalizedAt.reset();
  apiMock.getBallotsFinalizedAt
    .expectCallWith({ electionId })
    .resolves(new Date());
  apiMock.listParties.expectCallWith({ electionId }).resolves(election.parties);

  renderScreen(electionId);

  await screen.findByDisplayValue(election.parties[0].name);
  expect(screen.getButton('Add Party')).toBeDisabled();
  expect(screen.queryButton('Edit Parties')).not.toBeInTheDocument();
  expect(screen.queryButton('Save')).not.toBeInTheDocument();
  expect(screen.queryButton('Cancel')).not.toBeInTheDocument();
});

test('adding or deleting a party is disabled for elections with external source', async () => {
  const savedParties: Party[] = [
    { id: 'p1', abbrev: '1', fullName: 'party 1', name: 'p1' },
    { id: 'p2', abbrev: '2', fullName: 'party 2', name: 'p2' },
  ];

  apiMock.getElectionInfo.reset();
  apiMock.getElectionInfo.expectRepeatedCallsWith({ electionId }).resolves({
    ...electionInfoFromElection(election),
    externalSource: 'ms-sems',
  });
  apiMock.listParties.expectCallWith({ electionId }).resolves(savedParties);

  renderScreen(electionId);

  await screen.findByDisplayValue(savedParties[0].name);

  // Add Party button should not be visible
  expect(screen.queryButton('Add Party')).not.toBeInTheDocument();

  // Edit should be available but delete buttons should not be visible
  userEvent.click(screen.getButton('Edit Parties'));
  await screen.findButton('Save');

  expect(screen.queryButton(/Delete Party/i)).not.toBeInTheDocument();
});

test('cancelling', async () => {
  const savedParties: Party[] = [
    { id: 'p1', abbrev: '1', fullName: 'party 1', name: 'p1' },
    { id: 'p2', abbrev: '2', fullName: 'party 2', name: 'p2' },
    { id: 'p3', abbrev: '3', fullName: 'party 3', name: 'p3' },
  ];
  apiMock.listParties.expectCallWith({ electionId }).resolves(savedParties);

  const history = renderScreen(electionId);

  userEvent.click(await screen.findButton('Edit Parties'));
  expectPartyInputs(savedParties);

  userEvent.click(screen.getButton(`Delete Party ${savedParties[1].fullName}`));
  userEvent.type(getInputsByRow(1)[0], ' (edit)');
  userEvent.click(screen.getButton('Add Party'));
  {
    const inputs = getInputsByRow(2);
    userEvent.type(inputs[0], 'new party');
    userEvent.type(inputs[1], 'new');
    userEvent.type(inputs[2], 'n');
  }

  userEvent.click(screen.getButton('Cancel'));

  await screen.findButton('Edit Parties');
  expectPartyInputs(savedParties);
  expect(history.location.pathname).toEqual(partyRoutes.root.path);
});

describe('error messages', () => {
  interface Spec {
    inputIndex: number;
    fieldName: keyof Party;
    code: DuplicatePartyError['code'];
    expectedMessage: string;
  }

  const specs: Spec[] = [
    {
      code: 'duplicate-abbrev',
      expectedMessage: 'There is already a party with the same abbreviation.',
      fieldName: 'abbrev',
      inputIndex: 2,
    },
    {
      code: 'duplicate-full-name',
      expectedMessage: 'There is already a party with the same full name.',
      fieldName: 'fullName',
      inputIndex: 0,
    },
    {
      code: 'duplicate-name',
      expectedMessage: 'There is already a party with the same short name.',
      fieldName: 'name',
      inputIndex: 1,
    },
  ];

  for (const spec of specs) {
    test(`${spec.code}`, async () => {
      const savedParties: Party[] = [
        { id: 'p1', abbrev: '1', fullName: 'party 1', name: 'p1' },
        { id: 'p2', abbrev: '2', fullName: 'party 2', name: 'p2' },
      ];

      apiMock.listParties.expectCallWith({ electionId }).resolves(savedParties);

      renderScreen(electionId);
      userEvent.click(await screen.findButton('Edit Parties'));

      expectUpdate(apiMock, {
        electionId,
        updatedParties: savedParties,
      }).resolves(err({ code: spec.code, partyId: savedParties[0].id }));

      userEvent.click(screen.getButton('Save'));

      await screen.findByText(spec.expectedMessage);

      // [TODO] Assert that the error is positioned under the relevant row.

      // Editing the problem district should clear the error:
      const input = getInputsByRow(0)[spec.inputIndex];
      userEvent.type(input, ' (edit)');
      expect(screen.queryByText(spec.expectedMessage)).not.toBeInTheDocument();
    });
  }
});

test('audio editing', async () => {
  const { parties } = election;
  apiMock.listParties.expectCallWith({ electionId }).resolves(parties);
  mockStateFeatures(apiMock, electionId, { AUDIO_PROOFING: true });

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

    userEvent.click(button);

    await screen.findByTestId(MOCK_AUDIO_PANEL_ID);
    expect(history.location.pathname).toEqual(
      partyRoutes.audio({ stringKey: key, subkey: partyId })
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
  userEvent.click(editButton);
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
