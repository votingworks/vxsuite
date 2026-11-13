import { afterEach, beforeEach, expect, test } from 'vitest';
import { makeIdFactory } from '@votingworks/test-utils';
import { userEvent } from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { assertDefined, DateWithoutTime, err, ok } from '@votingworks/basics';
import type {
  DuplicatePartyError,
  ElectionInfo,
  PartiesUpdate,
} from '@votingworks/election-definition-backend';
import {
  ElectionStringKey,
  LanguageCode,
  type Party,
} from '@votingworks/types';
import {
  createMockApiClient,
  type MockApiClient,
  provideApi,
} from '../test/api_helpers.js';
import { render, screen, within } from '../test/react_testing_library.js';
import { withRoute } from '../test/routing_helpers.js';
import { PartiesEditor, type PartiesEditorProps } from './parties_editor.js';

const idFactory = makeIdFactory();

const electionId = 'election-1';
const viewPath = `/elections/${electionId}/parties`;
const editPath = `${viewPath}/edit`;

const electionInfo: ElectionInfo = {
  electionId,
  type: 'general',
  date: new DateWithoutTime('2026-11-03'),
  title: 'General Election',
  state: 'Demo State',
  jurisdictionName: 'Demo County',
  seal: '',
  languageCodes: [LanguageCode.ENGLISH],
};

const savedParties: Party[] = [
  { id: 'p1', abbrev: '1', fullName: 'party 1', name: 'p1' },
  { id: 'p2', abbrev: '2', fullName: 'party 2', name: 'p2' },
  { id: 'p3', abbrev: '3', fullName: 'party 3', name: 'p3' },
];

let apiMock: MockApiClient;

beforeEach(() => {
  idFactory.reset();
  apiMock = createMockApiClient();
  apiMock.getElectionInfo
    .expectRepeatedCallsWith({ electionId })
    .resolves(electionInfo);
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderEditor(props: Partial<PartiesEditorProps> = {}) {
  const history = createMemoryHistory({ initialEntries: [viewPath] });
  render(
    provideApi(
      apiMock,
      withRoute(<PartiesEditor electionId={electionId} {...props} />, {
        paramPath: '/elections/:electionId/parties',
        history,
      })
    )
  );
  return history;
}

test('adding parties to empty list', async () => {
  apiMock.listParties.expectCallWith({ electionId }).resolves([]);

  const history = renderEditor();

  await screen.findByText(
    "You haven't added any parties to this election yet."
  );
  expect(screen.getButton('Edit Parties')).toBeDisabled();

  const newParty1: Party = {
    id: idFactory.next(),
    name: 'New Party 1',
    fullName: 'New Party Full Name 1',
    abbrev: 'NP1',
  };
  await userEvent.click(screen.getButton('Add Party'));
  await screen.findButton('Save');
  expect(history.location.pathname).toEqual(editPath);
  await typeParty(0, newParty1);

  const newParty2: Party = {
    id: idFactory.next(),
    name: 'New Party 2',
    fullName: 'New Party Full Name 2',
    abbrev: 'NP2',
  };
  await userEvent.click(screen.getButton('Add Party'));
  await typeParty(1, newParty2);

  await userEvent.click(screen.getButton('Add Party'));
  await userEvent.type(getInputsByRow(2)[0]!, 'Temporary Party');
  await userEvent.click(screen.getButton('Delete Party Temporary Party'));

  const newParties = [newParty1, newParty2];
  expectPartyInputs(newParties);

  expectUpdate({ electionId, newParties }).resolves(ok());
  apiMock.listParties.expectCallWith({ electionId }).resolves(newParties);

  await userEvent.click(screen.getButton('Save'));

  await screen.findButton('Edit Parties');
  expectPartyInputs(newParties);
  expect(history.location.pathname).toEqual(viewPath);
});

test('editing existing party list', async () => {
  const [preservedParty, deletedParty, editedParty] = savedParties;
  const updatedParty: Party = {
    id: editedParty!.id,
    abbrev: '3 (edit)',
    fullName: 'party 3 (edit)',
    name: 'p3 (edit)',
  };

  apiMock.listParties.expectCallWith({ electionId }).resolves(savedParties);

  renderEditor();

  await userEvent.click(await screen.findButton('Edit Parties'));
  expect(screen.queryButton('Edit Parties')).not.toBeInTheDocument();

  await userEvent.click(
    screen.getButton(`Delete Party ${deletedParty!.fullName}`)
  );
  expectPartyInputs([preservedParty!, editedParty!]);

  for (const input of getInputsByRow(1)) {
    await userEvent.type(input, ' (edit)');
  }

  const newParty: Party = {
    id: idFactory.next(),
    fullName: 'new party',
    abbrev: 'n',
    name: 'new',
  };
  await userEvent.click(screen.getButton('Add Party'));
  await typeParty(2, newParty);

  const updatedList = [preservedParty!, updatedParty, newParty];
  expectPartyInputs(updatedList);

  expectUpdate({
    electionId,
    deletedPartyIds: [deletedParty!.id],
    newParties: [newParty],
    updatedParties: [preservedParty!, updatedParty],
  }).resolves(ok());
  apiMock.listParties.expectCallWith({ electionId }).resolves(updatedList);

  await userEvent.click(screen.getButton('Save'));
  await screen.findButton('Edit Parties');
  expectPartyInputs(updatedList);
});

test('editing and adding are disabled when locked', async () => {
  apiMock.listParties.expectCallWith({ electionId }).resolves(savedParties);

  renderEditor({ isLocked: true });

  await screen.findByDisplayValue(savedParties[0]!.name);
  expect(screen.getButton('Add Party')).toBeDisabled();
  expect(screen.queryButton('Edit Parties')).not.toBeInTheDocument();
  expect(screen.queryButton('Save')).not.toBeInTheDocument();
  expect(screen.queryButton('Cancel')).not.toBeInTheDocument();
});

test('adding and editing are hidden for elections with external source', async () => {
  apiMock.getElectionInfo.reset();
  apiMock.getElectionInfo
    .expectRepeatedCallsWith({ electionId })
    .resolves({ ...electionInfo, externalSource: 'ms-sems' });
  apiMock.listParties.expectCallWith({ electionId }).resolves(savedParties);

  renderEditor();

  await screen.findByDisplayValue(savedParties[0]!.name);
  expect(screen.queryButton('Add Party')).not.toBeInTheDocument();
  expect(screen.queryButton('Edit Parties')).not.toBeInTheDocument();
});

test('cancelling', async () => {
  apiMock.listParties.expectCallWith({ electionId }).resolves(savedParties);

  const history = renderEditor();

  await userEvent.click(await screen.findButton('Edit Parties'));
  expectPartyInputs(savedParties);

  await userEvent.click(
    screen.getButton(`Delete Party ${savedParties[1]!.fullName}`)
  );
  await userEvent.type(getInputsByRow(1)[0]!, ' (edit)');
  await userEvent.click(screen.getButton('Add Party'));
  await typeParty(2, {
    id: idFactory.next(),
    fullName: 'new party',
    name: 'new',
    abbrev: 'n',
  });

  await userEvent.click(screen.getButton('Cancel'));

  await screen.findButton('Edit Parties');
  expectPartyInputs(savedParties);
  expect(history.location.pathname).toEqual(viewPath);
});

test.each<{
  code: DuplicatePartyError['code'];
  expectedMessage: string;
  inputIndex: number;
}>([
  {
    code: 'duplicate-full-name',
    expectedMessage: 'There is already a party with the same full name.',
    inputIndex: 0,
  },
  {
    code: 'duplicate-name',
    expectedMessage: 'There is already a party with the same short name.',
    inputIndex: 1,
  },
  {
    code: 'duplicate-abbrev',
    expectedMessage: 'There is already a party with the same abbreviation.',
    inputIndex: 2,
  },
])('error message for $code', async ({ code, expectedMessage, inputIndex }) => {
  apiMock.listParties.expectCallWith({ electionId }).resolves(savedParties);

  renderEditor();
  await userEvent.click(await screen.findButton('Edit Parties'));

  expectUpdate({ electionId, updatedParties: savedParties }).resolves(
    err({ code, partyId: savedParties[1]!.id })
  );
  await userEvent.click(screen.getButton('Save'));
  await screen.findByText(expectedMessage);

  await userEvent.type(getInputsByRow(0)[inputIndex]!, ' (edit)');
  screen.getByText(expectedMessage);

  await userEvent.type(getInputsByRow(1)[inputIndex]!, ' (edit)');
  expect(screen.queryByText(expectedMessage)).not.toBeInTheDocument();
});

test('error message when deleting a party would make two contests the same', async () => {
  apiMock.listParties.expectCallWith({ electionId }).resolves(savedParties);

  renderEditor();
  await userEvent.click(await screen.findButton('Edit Parties'));
  const deletedParty = savedParties[1]!;
  await userEvent.click(
    screen.getButton(`Delete Party ${deletedParty.fullName}`)
  );

  const expectedMessage =
    'Deleting this party would make two contests the same. Change one of the contests before deleting the party.';
  expectUpdate({
    electionId,
    deletedPartyIds: [deletedParty.id],
    updatedParties: [savedParties[0]!, savedParties[2]!],
  }).resolves(err({ code: 'duplicate-contest', partyId: deletedParty.id }));
  await userEvent.click(screen.getButton('Save'));
  await screen.findByText(expectedMessage);

  await userEvent.click(screen.getButton('Cancel'));
  await screen.findButton('Edit Parties');
  expect(screen.queryByText(expectedMessage)).not.toBeInTheDocument();
  expectPartyInputs(savedParties);
});

test('audio editing', async () => {
  apiMock.listParties.expectCallWith({ electionId }).resolves(savedParties);
  apiMock.getStateFeatures
    .expectRepeatedCallsWith({ electionId })
    .resolves({ AUDIO_ENABLED: true });

  const history = renderEditor({
    AudioPanel: () => <div data-testid="audio-panel" />,
  });
  const editButton = await screen.findButton('Edit Parties');

  expect(await screen.findAllButtons(/preview or edit audio/i)).toHaveLength(
    savedParties.length * 2
  );

  for (const party of savedParties) {
    for (const [value, stringKey] of [
      [party.fullName, ElectionStringKey.PARTY_FULL_NAME],
      [party.name, ElectionStringKey.PARTY_NAME],
    ] as const) {
      const input = screen.getByDisplayValue(value);
      const container = assertDefined(input.parentElement);
      await userEvent.click(
        within(container).getButton(/preview or edit audio/i)
      );
      await screen.findByTestId('audio-panel');
      expect(history.location.pathname).toEqual(
        `${viewPath}/audio/${stringKey}/${party.id}`
      );
    }
  }

  await userEvent.click(editButton);
  expect(screen.queryByTestId('audio-panel')).not.toBeInTheDocument();
  expect(screen.queryButton(/preview or edit audio/i)).not.toBeInTheDocument();
});

async function typeParty(rowIndex: number, party: Party) {
  const [fullNameInput, nameInput, abbrevInput] = getInputsByRow(rowIndex);
  await userEvent.type(fullNameInput!, party.fullName);
  await userEvent.type(nameInput!, party.name);
  await userEvent.type(abbrevInput!, party.abbrev);
}

function getInputsByRow(rowIndex: number) {
  const inputsPerRow = 3;
  const inputIndex = rowIndex * inputsPerRow;
  return screen
    .getAllByRole('textbox')
    .slice(inputIndex, inputIndex + inputsPerRow);
}

function expectPartyInputs(parties: readonly Party[]) {
  const inputValues = screen
    .getAllByRole('textbox')
    .map((input) => (input as HTMLInputElement).value);
  expect(inputValues).toEqual(
    parties.flatMap((p) => [p.fullName, p.name, p.abbrev])
  );
}

function expectUpdate(input: PartiesUpdate) {
  return apiMock.updateParties.expectCallWith({
    newParties: [],
    deletedPartyIds: [],
    updatedParties: [],
    ...input,
  });
}
