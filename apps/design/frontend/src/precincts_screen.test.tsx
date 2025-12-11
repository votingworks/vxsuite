import { afterEach, beforeEach, expect, test } from 'vitest';
import { ElectionRecord } from '@votingworks/design-backend';
import { Buffer } from 'node:buffer';
import { createMemoryHistory } from 'history';
import {
  DEFAULT_SYSTEM_SETTINGS,
  ElectionId,
  Precinct,
  PrecinctWithSplits,
  PrecinctWithoutSplits,
  hasSplits,
} from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { assert, assertDefined, err, ok } from '@votingworks/basics';
import {
  MockApiClient,
  createMockApiClient,
  mockStateFeatures,
  mockUserFeatures,
  jurisdiction,
  provideApi,
  user,
} from '../test/api_helpers';
import { generalElectionRecord } from '../test/fixtures';
import { makeIdFactory } from '../test/id_helpers';
import { withRoute } from '../test/routing_helpers';
import { routes } from './routes';
import { render, screen, waitFor, within } from '../test/react_testing_library';
import { PrecinctsScreen } from './precincts_screen';

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
  const { path } = routes.election(electionId).precincts.root;
  const history = createMemoryHistory({ initialEntries: [path] });
  render(
    provideApi(
      apiMock,
      withRoute(<PrecinctsScreen />, {
        paramPath: routes.election(':electionId').precincts.root.path,
        path,
      })
    )
  );
  return history;
}

const { election } = generalElectionRecord(jurisdiction.id);
const electionId = election.id;

beforeEach(() => {
  mockStateFeatures(apiMock, electionId);
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(DEFAULT_SYSTEM_SETTINGS);
});

test('adding a precinct', async () => {
  const newPrecinct: Precinct = {
    id: idFactory.next(),
    name: 'New Precinct',
    districtIds: [election.districts[0].id, election.districts[1].id],
  };

  apiMock.listPrecincts.expectCallWith({ electionId }).resolves([]);
  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves(election.districts);
  renderScreen(electionId);

  await screen.findByRole('heading', { name: 'Precincts' });
  await screen.findByText(
    "You haven't added any precincts to this election yet."
  );

  userEvent.click(screen.getByRole('button', { name: 'Add Precinct' }));
  await screen.findByRole('heading', { name: 'Add Precinct' });
  expect(screen.getByRole('link', { name: 'Precincts' })).toHaveAttribute(
    'href',
    `/elections/${electionId}/precincts`
  );

  userEvent.type(screen.getByLabelText('Name'), newPrecinct.name);

  for (const districtId of newPrecinct.districtIds) {
    userEvent.click(
      screen.getByRole('checkbox', {
        name: election.districts.find((d) => d.id === districtId)!.name,
      })
    );
  }

  apiMock.createPrecinct
    .expectCallWith({
      electionId,
      newPrecinct,
    })
    .resolves(ok());
  apiMock.listPrecincts.expectCallWith({ electionId }).resolves([newPrecinct]);
  // Districts haven't changed, but we are using coarse-grained invalidation
  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves(election.districts);
  userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await screen.findByRole('heading', { name: 'Precincts' });
  expect(
    (await screen.findAllByRole('columnheader')).map((th) => th.textContent)
  ).toEqual(['Name', 'Districts', '']);
  const rows = screen.getAllByRole('row');
  expect(rows).toHaveLength(2);
  expect(
    within(rows[1])
      .getAllByRole('cell')
      .map((td) => td.textContent)
  ).toEqual([
    newPrecinct.name,
    `${election.districts[0].name}, ${election.districts[1].name}`,
    'Edit',
  ]);
});

test('editing a precinct - adding splits in NH', async () => {
  const general = generalElectionRecord(jurisdiction.id);
  const nhElectionRecord: ElectionRecord = {
    ...general,
    election: { ...general.election, state: 'New Hampshire' },
  };
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const { election } = nhElectionRecord;
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const electionId = election.id;
  const savedPrecinct = election.precincts[0];
  assert(!hasSplits(savedPrecinct));

  const sealImage =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" id="seal"></svg>';
  const signatureImage =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" id="signature"></svg>';
  const changedPrecinct: PrecinctWithSplits = {
    id: savedPrecinct.id,
    name: 'Changed Precinct',
    splits: [
      {
        id: idFactory.next(),
        name: 'Split 1',
        districtIds: [election.districts[0].id],
      },
      {
        id: (() => {
          // Burn one ID since we're gonna delete a split
          idFactory.next();
          return idFactory.next();
        })(),
        name: 'Split 2',
        districtIds: [election.districts[1].id],
        electionTitleOverride: 'Mock Election Override Name',
        electionSealOverride: sealImage,
        clerkSignatureImage: signatureImage,
        clerkSignatureCaption: 'Town Clerk',
      },
    ],
  };

  mockStateFeatures(apiMock, electionId, {
    PRECINCT_SPLIT_CLERK_SIGNATURE_CAPTION_OVERRIDE: true,
    PRECINCT_SPLIT_CLERK_SIGNATURE_IMAGE_OVERRIDE: true,
    PRECINCT_SPLIT_ELECTION_SEAL_OVERRIDE: true,
    PRECINCT_SPLIT_ELECTION_TITLE_OVERRIDE: true,
  });
  apiMock.listPrecincts
    .expectCallWith({ electionId })
    .resolves(election.precincts);
  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves(election.districts);
  renderScreen(electionId);

  await screen.findByRole('heading', { name: 'Precincts' });
  await screen.findByText(savedPrecinct.name);
  const rows = screen.getAllByRole('row');
  expect(rows).toHaveLength(
    election.precincts.length + 2 /* precinct splits */ + 1
  );

  const savedPrecinctRow = screen.getByText(savedPrecinct.name).closest('tr')!;
  expect(
    within(savedPrecinctRow)
      .getAllByRole('cell')
      .map((td) => td.textContent)
  ).toEqual([
    savedPrecinct.name,
    `${election.districts[0].name}, ${election.districts[1].name}`,
    'Edit',
  ]);
  userEvent.click(
    within(savedPrecinctRow).getByRole('button', { name: 'Edit' })
  );
  await screen.findByRole('heading', { name: 'Edit Precinct' });
  expect(screen.getByRole('link', { name: 'Precincts' })).toHaveAttribute(
    'href',
    `/elections/${electionId}/precincts`
  );

  const nameInput = screen.getByLabelText('Name');
  expect(nameInput).toHaveValue(savedPrecinct.name);
  userEvent.clear(nameInput);
  userEvent.type(nameInput, changedPrecinct.name);

  userEvent.click(screen.getByRole('button', { name: 'Add Split' }));
  userEvent.click(screen.getByRole('button', { name: 'Add Split' }));

  const splitCards = screen
    .getAllByRole('button', { name: 'Remove Split' })
    .map((button) => button.closest('div')!);
  expect(splitCards).toHaveLength(3);
  const [split1Card, split2Card, split3Card] = splitCards;

  const split1NameInput = within(split1Card).getByLabelText('Name');
  expect(split1NameInput).toHaveValue('');
  userEvent.type(split1NameInput, changedPrecinct.splits[0].name);

  // Selected districts carry over to first precinct split
  within(split1Card).getByRole('checkbox', {
    name: election.districts[0].name,
    checked: true,
  });
  userEvent.click(
    within(split1Card).getByRole('checkbox', {
      name: election.districts[1].name,
      checked: true,
    })
  );
  within(split1Card).getByRole('checkbox', {
    name: election.districts[2].name,
    checked: false,
  });

  for (const district of election.districts) {
    within(split2Card).getByRole('checkbox', {
      name: district.name,
      checked: false,
    });
  }
  userEvent.click(
    within(split2Card).getByRole('button', { name: 'Remove Split' })
  );

  const split3NameInput = within(split3Card).getByLabelText('Name');
  expect(split3NameInput).toHaveValue('');
  userEvent.type(split3NameInput, changedPrecinct.splits[1].name);
  for (const district of election.districts) {
    within(split3Card).getByRole('checkbox', {
      name: district.name,
      checked: false,
    });
  }
  userEvent.click(
    within(split3Card).getByRole('checkbox', {
      name: election.districts[1].name,
    })
  );

  // Update NH-configurable fields
  const split3ElectionTitleOverrideInput = within(split3Card).getByLabelText(
    'Election Title Override'
  );
  expect(split3ElectionTitleOverrideInput).toHaveValue('');
  userEvent.type(
    split3ElectionTitleOverrideInput,
    assertDefined(changedPrecinct.splits[1].electionTitleOverride)
  );
  const split3ElectionSealOverrideInput =
    within(split3Card).getByLabelText('Upload Seal Image').parentElement!;
  userEvent.upload(
    split3ElectionSealOverrideInput,
    new File([sealImage], 'seal.svg', {
      type: 'image/svg+xml',
    })
  );
  await waitFor(() =>
    expect(within(split3Card).getByRole('img')).toHaveAttribute(
      'src',
      `data:image/svg+xml;base64,${Buffer.from(sealImage).toString('base64')}`
    )
  );

  const split3ClerkSignatureCaption =
    within(split3Card).getByLabelText('Signature Caption');
  expect(split3ClerkSignatureCaption).toHaveValue('');
  userEvent.type(
    split3ClerkSignatureCaption,
    assertDefined(changedPrecinct.splits[1].clerkSignatureCaption)
  );

  const signatureInput = within(split3Card).getByLabelText(
    'Upload Signature Image'
  ).parentElement!;
  userEvent.upload(
    signatureInput,
    new File([signatureImage], 'signature.svg', {
      type: 'image/svg+xml',
    })
  );
  await waitFor(() => {
    const srcs = within(split3Card)
      .getAllByRole('img')
      .map((img) => img.getAttribute('src'));
    expect(srcs).toContain(
      `data:image/svg+xml;base64,${Buffer.from(signatureImage).toString(
        'base64'
      )}`
    );
  });

  apiMock.updatePrecinct
    .expectCallWith({ electionId, updatedPrecinct: changedPrecinct })
    .resolves(ok());
  apiMock.listPrecincts
    .expectCallWith({ electionId })
    .resolves([changedPrecinct, ...election.precincts.slice(1)]);
  // Districts haven't changed, but we are using coarse-grained invalidation
  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves(election.districts);
  userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await screen.findByRole('heading', { name: 'Precincts' });
  expect(screen.getAllByRole('row')).toHaveLength(
    election.precincts.length + 4 /* precinct splits */ + 1
  );
  const changedPrecinctRow = screen
    .getByText(changedPrecinct.name)
    .closest('tr')!;
  expect(
    within(changedPrecinctRow)
      .getAllByRole('cell')
      .map((td) => td.textContent)
  ).toEqual([changedPrecinct.name, '', 'Edit']);
  expect(
    within(changedPrecinctRow.nextSibling as HTMLTableRowElement)
      .getAllByRole('cell')
      .map((td) => td.textContent)
  ).toEqual([changedPrecinct.splits[0].name, election.districts[0].name, '']);
  expect(
    within(changedPrecinctRow.nextSibling!.nextSibling as HTMLTableRowElement)
      .getAllByRole('cell')
      .map((td) => td.textContent)
  ).toEqual([changedPrecinct.splits[1].name, election.districts[1].name, '']);
});

test('editing a precinct - removing splits', async () => {
  const savedPrecinct = election.precincts.find(hasSplits)!;
  assert(savedPrecinct.splits.length === 2);

  const changedPrecinct: PrecinctWithoutSplits = {
    id: savedPrecinct.id,
    name: savedPrecinct.name,
    districtIds: savedPrecinct.splits[1].districtIds,
  };

  apiMock.listPrecincts
    .expectCallWith({ electionId })
    .resolves(election.precincts);
  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves(election.districts);
  renderScreen(electionId);

  await screen.findByRole('heading', { name: 'Precincts' });
  const savedPrecinctRow = (
    await screen.findByText(savedPrecinct.name)
  ).closest('tr')!;
  userEvent.click(
    within(savedPrecinctRow).getByRole('button', { name: 'Edit' })
  );
  await screen.findByRole('heading', { name: 'Edit Precinct' });

  const splitCards = screen
    .getAllByRole('button', { name: 'Remove Split' })
    .map((button) => button.closest('div')!);
  const [split1Card] = splitCards;
  userEvent.click(
    within(split1Card).getByRole('button', { name: 'Remove Split' })
  );
  expect(
    screen.queryByRole('button', { name: 'Remove Split' })
  ).not.toBeInTheDocument();

  // Districts from last remaining split should be selected for the whole precinct
  screen.getByRole('checkbox', {
    name: election.districts[0].name,
    checked: true,
  });
  screen.getByRole('checkbox', {
    name: election.districts[1].name,
    checked: true,
  });
  screen.getByRole('checkbox', {
    name: election.districts[2].name,
    checked: false,
  });

  apiMock.updatePrecinct
    .expectCallWith({ electionId, updatedPrecinct: changedPrecinct })
    .resolves(ok());
  apiMock.listPrecincts
    .expectCallWith({ electionId })
    .resolves(
      election.precincts.map((p) =>
        p.id === changedPrecinct.id ? changedPrecinct : p
      )
    );
  // Districts haven't changed, but we are using coarse-grained invalidation
  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves(election.districts);
  userEvent.type(screen.getByLabelText('Name'), '{enter}');

  await screen.findByRole('heading', { name: 'Precincts' });
  expect(screen.getAllByRole('row')).toHaveLength(
    election.precincts.length + 1
  );
  const changedPrecinctRow = screen
    .getByText(changedPrecinct.name)
    .closest('tr')!;
  expect(
    within(changedPrecinctRow)
      .getAllByRole('cell')
      .map((td) => td.textContent)
  ).toEqual([changedPrecinct.name, 'District 1, District 2', 'Edit']);
});

test('deleting a precinct', async () => {
  assert(election.precincts.length === 3);
  const [savedPrecinct] = election.precincts;

  apiMock.listPrecincts
    .expectCallWith({ electionId })
    .resolves(election.precincts);
  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves(election.districts);
  renderScreen(electionId);

  await screen.findByRole('heading', { name: 'Precincts' });
  const savedPrecinctRow = (
    await screen.findByText(savedPrecinct.name)
  ).closest('tr')!;
  userEvent.click(
    within(savedPrecinctRow).getByRole('button', { name: 'Edit' })
  );

  await screen.findByRole('heading', { name: 'Edit Precinct' });

  apiMock.deletePrecinct
    .expectCallWith({
      electionId,
      precinctId: savedPrecinct.id,
    })
    .resolves();
  apiMock.listPrecincts
    .expectCallWith({ electionId })
    .resolves(election.precincts.slice(1));
  // Districts haven't changed, but we are using coarse-grained invalidation
  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves(election.districts);
  // Initiate the deletion
  userEvent.click(screen.getByRole('button', { name: 'Delete Precinct' }));
  // Confirm the deletion in the modal
  userEvent.click(screen.getByRole('button', { name: 'Delete Precinct' }));

  await screen.findByRole('heading', { name: 'Precincts' });
  expect(screen.getAllByRole('row')).toHaveLength(
    election.precincts.length + 2 /* precinct splits */
  );
  expect(screen.queryByText(savedPrecinct.name)).not.toBeInTheDocument();
});

test('editing or adding a precinct is disabled when ballots are finalized', async () => {
  apiMock.getBallotsFinalizedAt.reset();
  apiMock.getBallotsFinalizedAt
    .expectCallWith({ electionId })
    .resolves(new Date());
  apiMock.listPrecincts
    .expectCallWith({ electionId })
    .resolves(election.precincts);
  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves(election.districts);
  renderScreen(electionId);

  await screen.findByRole('heading', { name: 'Precincts' });
  await screen.findByText(election.precincts[0].name);
  expect(screen.getAllByRole('button', { name: 'Edit' })[0]).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Add Precinct' })).toBeDisabled();
});

test('cancelling', async () => {
  apiMock.listPrecincts
    .expectCallWith({ electionId })
    .resolves(election.precincts);
  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves(election.districts);
  renderScreen(electionId);

  await screen.findByRole('heading', { name: 'Precincts' });
  userEvent.click((await screen.findAllByRole('button', { name: 'Edit' }))[0]);

  await screen.findByRole('heading', { name: 'Edit Precinct' });
  userEvent.click(screen.getByRole('button', { name: 'Delete Precinct' }));
  await screen.findByRole('heading', { name: 'Delete Precinct' });
  // Cancel in confirm delete modal
  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() =>
    expect(
      screen.queryByRole('heading', { name: 'Delete Precinct' })
    ).not.toBeInTheDocument()
  );

  // Cancel edit precinct
  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await screen.findByRole('heading', { name: 'Precincts' });
});

test('error message for duplicate precinct name', async () => {
  apiMock.listPrecincts
    .expectCallWith({ electionId })
    .resolves(election.precincts);
  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves(election.districts);
  renderScreen(electionId);
  await screen.findByRole('heading', { name: 'Precincts' });

  userEvent.click(await screen.findByRole('button', { name: 'Add Precinct' }));
  await screen.findByRole('heading', { name: 'Add Precinct' });
  userEvent.type(screen.getByLabelText('Name'), election.precincts[0].name);

  apiMock.createPrecinct
    .expectCallWith({
      electionId,
      newPrecinct: {
        id: idFactory.next(),
        name: election.precincts[0].name,
        districtIds: [],
      },
    })
    .resolves(err('duplicate-precinct-name'));
  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('There is already a precinct with the same name.');

  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await screen.findByRole('heading', { name: 'Precincts' });
  userEvent.click((await screen.findAllByRole('button', { name: 'Edit' }))[0]);

  await screen.findByRole('heading', { name: 'Edit Precinct' });
  const nameInput = screen.getByLabelText('Name');
  expect(nameInput).toHaveValue(election.precincts[0].name);
  userEvent.clear(nameInput);
  userEvent.type(nameInput, election.precincts[1].name);

  apiMock.updatePrecinct
    .expectCallWith({
      electionId,
      updatedPrecinct: {
        ...election.precincts[0],
        name: election.precincts[1].name,
      },
    })
    .resolves(err('duplicate-precinct-name'));
  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('There is already a precinct with the same name.');
});

test('error message for duplicate precinct split name', async () => {
  const savedPrecinct = election.precincts.find(hasSplits)!;
  assert(savedPrecinct.splits.length === 2);

  apiMock.listPrecincts
    .expectCallWith({ electionId })
    .resolves(election.precincts);
  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves(election.districts);
  renderScreen(electionId);

  await screen.findByRole('heading', { name: 'Precincts' });
  userEvent.click(await screen.findByRole('button', { name: 'Add Precinct' }));
  await screen.findByRole('heading', { name: 'Add Precinct' });
  userEvent.type(screen.getByLabelText('Name'), 'New Precinct');
  userEvent.click(screen.getByRole('button', { name: 'Add Split' }));
  const splitCards = screen
    .getAllByRole('button', { name: 'Remove Split' })
    .map((button) => button.closest('div')!);
  expect(splitCards).toHaveLength(2);
  const [split1Card, split2Card] = splitCards;
  userEvent.type(within(split1Card).getByLabelText('Name'), 'Split 1');
  userEvent.type(within(split2Card).getByLabelText('Name'), 'Split 1');

  apiMock.createPrecinct
    .expectCallWith({
      electionId,
      newPrecinct: {
        id: idFactory.next(),
        name: 'New Precinct',
        splits: [
          {
            id: idFactory.next(),
            name: 'Split 1',
            districtIds: [],
          },
          {
            id: idFactory.next(),
            name: 'Split 1',
            districtIds: [],
          },
        ],
      },
    })
    .resolves(err('duplicate-split-name'));
  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Precinct splits must have different names.');

  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  const savedPrecinctRow = (
    await screen.findByText(savedPrecinct.name)
  ).closest('tr')!;
  userEvent.click(
    within(savedPrecinctRow).getByRole('button', { name: 'Edit' })
  );
  await screen.findByRole('heading', { name: 'Edit Precinct' });
  const savedSplitCards = screen
    .getAllByRole('button', { name: 'Remove Split' })
    .map((button) => button.closest('div')!);
  expect(savedSplitCards).toHaveLength(2);
  const savedSplit1NameInput = within(savedSplitCards[0]).getByLabelText(
    'Name'
  );
  userEvent.clear(savedSplit1NameInput);
  userEvent.type(savedSplit1NameInput, savedPrecinct.splits[1].name);

  apiMock.updatePrecinct
    .expectCallWith({
      electionId,
      updatedPrecinct: {
        ...savedPrecinct,
        splits: [
          {
            ...savedPrecinct.splits[0],
            name: savedPrecinct.splits[1].name,
          },
          savedPrecinct.splits[1],
        ],
      },
    })
    .resolves(err('duplicate-split-name'));
  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Precinct splits must have different names.');
});

test('error message for splits with the same districts', async () => {
  const savedPrecinct = election.precincts.find(hasSplits)!;
  assert(savedPrecinct.splits.length === 2);

  apiMock.listPrecincts
    .expectCallWith({ electionId })
    .resolves(election.precincts);
  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves(election.districts);
  renderScreen(electionId);

  await screen.findByRole('heading', { name: 'Precincts' });
  userEvent.click(await screen.findByRole('button', { name: 'Add Precinct' }));
  await screen.findByRole('heading', { name: 'Add Precinct' });
  userEvent.type(screen.getByLabelText('Name'), 'New Precinct');
  userEvent.click(screen.getByRole('button', { name: 'Add Split' }));
  const splitCards = screen
    .getAllByRole('button', { name: 'Remove Split' })
    .map((button) => button.closest('div')!);
  expect(splitCards).toHaveLength(2);
  const [split1Card, split2Card] = splitCards;
  userEvent.type(within(split1Card).getByLabelText('Name'), 'Split 1');
  userEvent.type(within(split2Card).getByLabelText('Name'), 'Split 2');

  apiMock.createPrecinct
    .expectCallWith({
      electionId,
      newPrecinct: {
        id: idFactory.next(),
        name: 'New Precinct',
        splits: [
          {
            id: idFactory.next(),
            name: 'Split 1',
            districtIds: [],
          },
          {
            id: idFactory.next(),
            name: 'Split 2',
            districtIds: [],
          },
        ],
      },
    })
    .resolves(err('duplicate-split-districts'));
  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText(
    'Each precinct split must have a different set of districts.'
  );
});
