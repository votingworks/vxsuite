import { afterEach, beforeEach, expect, test } from 'vitest';
import { createMemoryHistory } from 'history';
import userEvent from '@testing-library/user-event';
import { DEFAULT_SYSTEM_SETTINGS, ElectionId, Party } from '@votingworks/types';
import { err, ok } from '@votingworks/basics';
import { readElectionGeneral } from '@votingworks/fixtures';
import {
  MockApiClient,
  createMockApiClient,
  mockUserFeatures,
  provideApi,
  user,
} from '../test/api_helpers';
import { render, screen, waitFor, within } from '../test/react_testing_library';
import { withRoute } from '../test/routing_helpers';
import { routes } from './routes';
import { makeIdFactory } from '../test/id_helpers';
import { PartiesScreen } from './parties_screen';

let apiMock: MockApiClient;

const idFactory = makeIdFactory();

beforeEach(() => {
  apiMock = createMockApiClient();
  idFactory.reset();
  apiMock.getUser.expectCallWith().resolves(user);
  mockUserFeatures(apiMock);
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderScreen(electionId: ElectionId) {
  const { path } = routes.election(electionId).parties.root;
  const history = createMemoryHistory({ initialEntries: [path] });
  render(
    provideApi(
      apiMock,
      withRoute(<PartiesScreen />, {
        paramPath: routes.election(':electionId').parties.root.path,
        path,
      })
    )
  );
  return history;
}

const election = readElectionGeneral();
const electionId = election.id;

beforeEach(() => {
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);

  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(DEFAULT_SYSTEM_SETTINGS);
});

test('adding a party', async () => {
  const newParty: Party = {
    id: idFactory.next(),
    name: 'New Party',
    fullName: 'New Party Full Name',
    abbrev: 'NP',
  };

  apiMock.listParties.expectCallWith({ electionId }).resolves([]);
  renderScreen(electionId);

  await screen.findByRole('heading', { name: 'Parties' });
  await screen.findByText(
    "You haven't added any parties to this election yet."
  );

  userEvent.click(screen.getByRole('button', { name: 'Add Party' }));
  await screen.findByRole('heading', { name: 'Add Party' });
  expect(screen.getByRole('link', { name: 'Parties' })).toHaveAttribute(
    'href',
    `/elections/${electionId}/parties`
  );

  userEvent.type(screen.getByLabelText('Full Name'), newParty.fullName);
  userEvent.type(screen.getByLabelText('Short Name'), newParty.name);
  userEvent.type(screen.getByLabelText('Abbreviation'), newParty.abbrev);

  apiMock.createParty.expectCallWith({ electionId, newParty }).resolves(ok());
  apiMock.listParties.expectCallWith({ electionId }).resolves([newParty]);
  userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await screen.findByRole('heading', { name: 'Parties' });
  expect(
    screen.getAllByRole('columnheader').map((th) => th.textContent)
  ).toEqual(['Name', 'Abbreviation', '']);
  const rows = screen.getAllByRole('row');
  expect(rows).toHaveLength(2);
  expect(
    within(rows[1])
      .getAllByRole('cell')
      .map((cell) => cell.textContent)
  ).toEqual([newParty.fullName, newParty.abbrev, 'Edit']);
});

test('editing a party', async () => {
  const savedParty = election.parties[0];
  const updatedParty: Party = {
    ...savedParty,
    name: 'Updated Party',
    fullName: 'Updated Party Full Name',
    abbrev: 'UP',
  };

  apiMock.listParties.expectCallWith({ electionId }).resolves(election.parties);
  renderScreen(electionId);

  await screen.findByRole('heading', { name: 'Parties' });
  const savedPartyRow = (await screen.findByText(savedParty.fullName)).closest(
    'tr'
  )!;
  userEvent.click(within(savedPartyRow).getByRole('button', { name: 'Edit' }));
  await screen.findByRole('heading', { name: 'Edit Party' });
  expect(screen.getByRole('link', { name: 'Parties' })).toHaveAttribute(
    'href',
    `/elections/${electionId}/parties`
  );

  const fullNameInput = screen.getByLabelText('Full Name');
  expect(fullNameInput).toHaveValue(savedParty.fullName);
  userEvent.clear(fullNameInput);
  userEvent.type(fullNameInput, updatedParty.fullName);

  const shortNameInput = screen.getByLabelText('Short Name');
  expect(shortNameInput).toHaveValue(savedParty.name);
  userEvent.clear(shortNameInput);
  userEvent.type(shortNameInput, updatedParty.name);

  const abbrevInput = screen.getByLabelText('Abbreviation');
  expect(abbrevInput).toHaveValue(savedParty.abbrev);
  userEvent.clear(abbrevInput);
  userEvent.type(abbrevInput, updatedParty.abbrev);

  apiMock.updateParty
    .expectCallWith({ electionId, updatedParty })
    .resolves(ok());
  apiMock.listParties
    .expectCallWith({ electionId })
    .resolves([updatedParty, ...election.parties.slice(1)]);
  userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await screen.findByRole('heading', { name: 'Parties' });
  const updatedPartyRow = screen
    .getByText(updatedParty.fullName)
    .closest('tr')!;
  expect(
    within(updatedPartyRow)
      .getAllByRole('cell')
      .map((cell) => cell.textContent)
  ).toEqual([updatedParty.fullName, updatedParty.abbrev, 'Edit']);
});

test('deleting a party', async () => {
  const [savedParty] = election.parties;

  apiMock.listParties.expectCallWith({ electionId }).resolves(election.parties);
  renderScreen(electionId);

  await screen.findByRole('heading', { name: 'Parties' });
  const savedPartyRow = (await screen.findByText(savedParty.fullName)).closest(
    'tr'
  )!;
  userEvent.click(within(savedPartyRow).getByRole('button', { name: 'Edit' }));
  await screen.findByRole('heading', { name: 'Edit Party' });

  apiMock.deleteParty
    .expectCallWith({ electionId, partyId: savedParty.id })
    .resolves();
  apiMock.listParties
    .expectCallWith({ electionId })
    .resolves(election.parties.slice(1));
  // Initiate the deletion
  userEvent.click(screen.getByRole('button', { name: 'Delete Party' }));
  // Confirm the deletion in the modal
  userEvent.click(screen.getByRole('button', { name: 'Delete Party' }));

  await screen.findByRole('heading', { name: 'Parties' });
  expect(screen.getAllByRole('row')).toHaveLength(election.parties.length);
  expect(screen.queryByText(savedParty.fullName)).not.toBeInTheDocument();
});

test('editing or adding a party is disabled when ballots are finalized', async () => {
  apiMock.getBallotsFinalizedAt.reset();
  apiMock.getBallotsFinalizedAt
    .expectCallWith({ electionId })
    .resolves(new Date());
  apiMock.listParties.expectCallWith({ electionId }).resolves(election.parties);
  renderScreen(electionId);

  await screen.findByRole('heading', { name: 'Parties' });
  await screen.findByText(election.parties[0].fullName);
  expect(screen.getAllByRole('button', { name: 'Edit' })[0]).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Add Party' })).toBeDisabled();
});

test('cancelling', async () => {
  apiMock.listParties.expectCallWith({ electionId }).resolves(election.parties);
  renderScreen(electionId);

  await screen.findByRole('heading', { name: 'Parties' });
  userEvent.click((await screen.findAllByRole('button', { name: 'Edit' }))[0]);

  await screen.findByRole('heading', { name: 'Edit Party' });
  userEvent.click(screen.getByRole('button', { name: 'Delete Party' }));
  await screen.findByRole('heading', { name: 'Delete Party' });
  // Cancel in confirm delete modal
  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() =>
    expect(
      screen.queryByRole('heading', { name: 'Delete Party' })
    ).not.toBeInTheDocument()
  );

  // Cancel edit party
  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await screen.findByRole('heading', { name: 'Parties' });
  expect(screen.getAllButtons('Edit')).toHaveLength(election.parties.length);
});

test('error messages for duplicate party full name/short name/abbrev', async () => {
  const [savedParty1, savedParty2] = election.parties;
  apiMock.listParties.expectCallWith({ electionId }).resolves(election.parties);
  renderScreen(electionId);

  await screen.findByRole('heading', { name: 'Parties' });
  expect(screen.getAllButtons('Edit')).toHaveLength(election.parties.length);
  userEvent.click(await screen.findByRole('button', { name: 'Add Party' }));

  await screen.findByRole('heading', { name: 'Add Party' });
  userEvent.type(screen.getByLabelText('Full Name'), savedParty1.fullName);
  userEvent.type(screen.getByLabelText('Short Name'), savedParty1.name);
  userEvent.type(screen.getByLabelText('Abbreviation'), savedParty1.abbrev);

  const id = idFactory.next();
  apiMock.createParty
    .expectCallWith({
      electionId,
      newParty: { ...savedParty1, id },
    })
    .resolves(err('duplicate-full-name'));
  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('There is already a party with the same full name.');

  apiMock.createParty
    .expectCallWith({
      electionId,
      newParty: { ...savedParty1, id },
    })
    .resolves(err('duplicate-name'));
  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('There is already a party with the same short name.');

  apiMock.createParty
    .expectCallWith({
      electionId,
      newParty: { ...savedParty1, id },
    })
    .resolves(err('duplicate-abbrev'));
  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText(
    'There is already a party with the same abbreviation.'
  );

  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await screen.findByRole('heading', { name: 'Parties' });
  const party2Row = screen.getByText(savedParty2.fullName).closest('tr')!;
  userEvent.click(within(party2Row).getByRole('button', { name: 'Edit' }));
  await screen.findByRole('heading', { name: 'Edit Party' });

  userEvent.clear(screen.getByLabelText('Full Name'));
  userEvent.type(screen.getByLabelText('Full Name'), savedParty1.fullName);
  userEvent.clear(screen.getByLabelText('Short Name'));
  userEvent.type(screen.getByLabelText('Short Name'), savedParty1.name);
  userEvent.clear(screen.getByLabelText('Abbreviation'));
  userEvent.type(screen.getByLabelText('Abbreviation'), savedParty1.abbrev);

  apiMock.updateParty
    .expectCallWith({
      electionId,
      updatedParty: { ...savedParty1, id: savedParty2.id },
    })
    .resolves(err('duplicate-full-name'));
  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('There is already a party with the same full name.');

  apiMock.updateParty
    .expectCallWith({
      electionId,
      updatedParty: { ...savedParty1, id: savedParty2.id },
    })
    .resolves(err('duplicate-name'));
  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('There is already a party with the same short name.');

  apiMock.updateParty
    .expectCallWith({
      electionId,
      updatedParty: { ...savedParty1, id: savedParty2.id },
    })
    .resolves(err('duplicate-abbrev'));
  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText(
    'There is already a party with the same abbreviation.'
  );
});
