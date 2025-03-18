import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { ElectionRecord } from '@votingworks/design-backend';
import { Buffer } from 'node:buffer';
import { createMemoryHistory } from 'history';
import {
  District,
  DistrictId,
  ElectionId,
  SplittablePrecinct,
  PrecinctWithSplits,
  PrecinctWithoutSplits,
  hasSplits,
} from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { assert, assertDefined } from '@votingworks/basics';
import { readElectionGeneral } from '@votingworks/fixtures';
import {
  MockApiClient,
  createMockApiClient,
  mockElectionFeatures,
  mockUserFeatures,
  provideApi,
  user,
} from '../test/api_helpers';
import { generalElectionRecord } from '../test/fixtures';
import { makeIdFactory } from '../test/id_helpers';
import { withRoute } from '../test/routing_helpers';
import { routes } from './routes';
import { render, screen, waitFor, within } from '../test/react_testing_library';
import { GeographyScreen } from './geography_screen';

let apiMock: MockApiClient;

const idFactory = makeIdFactory();

const electionGeneral = readElectionGeneral();

beforeEach(() => {
  apiMock = createMockApiClient();
  idFactory.reset();
  apiMock.getUser.expectCallWith().resolves(user);
  mockUserFeatures(apiMock, user);
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderScreen(electionId: ElectionId) {
  const { path } = routes.election(electionId).geography.root;
  const history = createMemoryHistory({ initialEntries: [path] });
  render(
    provideApi(
      apiMock,
      withRoute(<GeographyScreen />, {
        paramPath: routes.election(':electionId').geography.root.path,
        path,
      })
    )
  );
  return history;
}

describe('Districts tab', () => {
  const election = electionGeneral;
  const electionId = election.id;
  beforeEach(() => {
    apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  });

  test('adding a district', async () => {
    const newDistrict: District = {
      id: idFactory.next() as DistrictId,
      name: 'New District',
    };

    apiMock.listDistricts.expectCallWith({ electionId }).resolves([]);
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Geography' });
    screen.getByRole('tab', { name: 'Districts', selected: true });
    screen.getByText("You haven't added any districts to this election yet.");

    userEvent.click(screen.getByRole('button', { name: 'Add District' }));
    await screen.findByRole('heading', { name: 'Add District' });

    userEvent.type(screen.getByLabelText('Name'), newDistrict.name);

    apiMock.createDistrict
      .expectCallWith({ electionId, newDistrict })
      .resolves();
    apiMock.listDistricts
      .expectCallWith({ electionId })
      .resolves([newDistrict]);
    userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByRole('heading', { name: 'Geography' });
    screen.getByRole('tab', { name: 'Districts', selected: true });
    expect(
      screen.getAllByRole('columnheader').map((th) => th.textContent)
    ).toEqual(['Name', '']);
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(
      within(rows[1])
        .getAllByRole('cell')
        .map((td) => td.textContent)
    ).toEqual([newDistrict.name, 'Edit']);
  });

  test('editing a district', async () => {
    const savedDistrict = election.districts[0];
    const updatedDistrict: District = {
      ...savedDistrict,
      name: 'Updated District',
    };

    apiMock.listDistricts
      .expectCallWith({ electionId })
      .resolves(election.districts);
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Geography' });
    screen.getByRole('tab', { name: 'Districts', selected: true });
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(election.districts.length + 1);

    const savedDistrictRow = screen
      .getByText(savedDistrict.name)
      .closest('tr')!;
    const contestRowIndex = rows.indexOf(savedDistrictRow);
    userEvent.click(
      within(savedDistrictRow).getByRole('button', { name: 'Edit' })
    );

    await screen.findByRole('heading', { name: 'Edit District' });

    const nameInput = screen.getByLabelText('Name');
    expect(nameInput).toHaveValue(savedDistrict.name);
    userEvent.clear(nameInput);
    userEvent.type(nameInput, updatedDistrict.name);

    apiMock.updateDistrict
      .expectCallWith({ electionId, updatedDistrict })
      .resolves();
    apiMock.listDistricts
      .expectCallWith({ electionId })
      .resolves([updatedDistrict, ...election.districts.slice(1)]);
    userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByRole('heading', { name: 'Geography' });
    screen.getByRole('tab', { name: 'Districts', selected: true });

    const updatedDistrictRow = screen.getAllByRole('row')[contestRowIndex];
    within(updatedDistrictRow).getByText(updatedDistrict.name);
  });

  test('deleting a district', async () => {
    assert(election.districts.length === 3);

    const [savedDistrict, remainingDistrict, unusedDistrict] =
      election.districts;

    apiMock.listDistricts
      .expectCallWith({ electionId })
      .resolves(election.districts);
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Geography' });
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(election.districts.length + 1);
    const savedDistrictRow = screen
      .getByText(savedDistrict.name)
      .closest('tr')!;
    userEvent.click(
      within(savedDistrictRow).getByRole('button', { name: 'Edit' })
    );

    await screen.findByRole('heading', { name: 'Edit District' });

    apiMock.deleteDistrict
      .expectCallWith({ electionId, districtId: savedDistrict.id })
      .resolves();
    apiMock.listDistricts
      .expectCallWith({ electionId })
      .resolves([remainingDistrict, unusedDistrict]);
    // Initiate the deletion
    userEvent.click(screen.getByRole('button', { name: 'Delete District' }));
    // Confirm the deletion in the modal
    userEvent.click(screen.getByRole('button', { name: 'Delete District' }));

    await screen.findByRole('heading', { name: 'Geography' });
    expect(screen.getAllByRole('row')).toHaveLength(election.districts.length);
    expect(screen.queryByText(savedDistrict.name)).not.toBeInTheDocument();
  });

  test('editing or adding a district is disabled when ballots are finalized', async () => {
    const savedDistrict = election.districts[0];
    apiMock.getBallotsFinalizedAt.reset();
    apiMock.getBallotsFinalizedAt
      .expectCallWith({ electionId })
      .resolves(new Date());
    apiMock.listDistricts
      .expectCallWith({ electionId })
      .resolves(election.districts);
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Geography' });
    screen.getByRole('tab', { name: 'Districts', selected: true });
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(election.districts.length + 1);

    const savedDistrictRow = screen
      .getByText(savedDistrict.name)
      .closest('tr')!;
    expect(
      within(savedDistrictRow).getByRole('button', { name: 'Edit' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add District' })).toBeDisabled();
  });

  test('cancelling', async () => {
    apiMock.listDistricts
      .expectCallWith({ electionId })
      .resolves(election.districts);
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Geography' });
    screen.getByRole('tab', { name: 'Districts', selected: true });
    userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);

    await screen.findByRole('heading', { name: 'Edit District' });
    userEvent.click(screen.getByRole('button', { name: 'Delete District' }));
    await screen.findByRole('heading', { name: 'Delete District' });
    // Cancel in confirm delete modal
    userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Delete District' })
      ).not.toBeInTheDocument()
    );

    // Cancel edit district
    userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await screen.findByRole('heading', { name: 'Geography' });
    screen.getByRole('tab', { name: 'Districts', selected: true });
  });
});

describe('Precincts tab', () => {
  const { election, precincts } = generalElectionRecord(user.orgId);
  const electionId = election.id;

  beforeEach(() => {
    apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  });

  test('adding a precinct', async () => {
    const newPrecinct: SplittablePrecinct = {
      id: idFactory.next(),
      name: 'New Precinct',
      districtIds: [election.districts[0].id, election.districts[1].id],
    };

    mockElectionFeatures(apiMock, electionId, {});
    apiMock.listPrecincts.expectCallWith({ electionId }).resolves([]);
    apiMock.listDistricts
      .expectCallWith({ electionId })
      .resolves(election.districts);
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Geography' });
    userEvent.click(screen.getByRole('tab', { name: 'Precincts' }));
    await screen.findByText(
      "You haven't added any precincts to this election yet."
    );

    userEvent.click(screen.getByRole('button', { name: 'Add Precinct' }));
    await screen.findByRole('heading', { name: 'Add Precinct' });

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
      .resolves();
    apiMock.listPrecincts
      .expectCallWith({ electionId })
      .resolves([newPrecinct]);
    // Districts haven't changed, but we are using coarse-grained invalidation
    apiMock.listDistricts
      .expectCallWith({ electionId })
      .resolves(election.districts);
    userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByRole('heading', { name: 'Geography' });
    screen.getByRole('tab', { name: 'Precincts', selected: true });
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
    const general = generalElectionRecord(user.orgId);
    const nhElectionRecord: ElectionRecord = {
      ...general,
      election: { ...general.election, state: 'New Hampshire' },
    };
    // eslint-disable-next-line @typescript-eslint/no-shadow
    const { election, precincts } = nhElectionRecord;
    // eslint-disable-next-line @typescript-eslint/no-shadow
    const electionId = election.id;
    const savedPrecinct = precincts[0];
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

    mockElectionFeatures(apiMock, electionId, {
      PRECINCT_SPLIT_CLERK_SIGNATURE_CAPTION: true,
      PRECINCT_SPLIT_CLERK_SIGNATURE_IMAGE: true,
      PRECINCT_SPLIT_ELECTION_SEAL_OVERRIDE: true,
      PRECINCT_SPLIT_ELECTION_TITLE_OVERRIDE: true,
    });
    apiMock.listPrecincts.expectCallWith({ electionId }).resolves(precincts);
    apiMock.listDistricts
      .expectCallWith({ electionId })
      .resolves(election.districts);
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Geography' });
    userEvent.click(screen.getByRole('tab', { name: 'Precincts' }));
    await screen.findByText(savedPrecinct.name);
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(precincts.length + 2 /* precinct splits */ + 1);

    const savedPrecinctRow = screen
      .getByText(savedPrecinct.name)
      .closest('tr')!;
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
      .resolves();
    apiMock.listPrecincts
      .expectCallWith({ electionId })
      .resolves([changedPrecinct, ...precincts.slice(1)]);
    // Districts haven't changed, but we are using coarse-grained invalidation
    apiMock.listDistricts
      .expectCallWith({ electionId })
      .resolves(election.districts);
    userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByRole('heading', { name: 'Geography' });
    expect(screen.getAllByRole('row')).toHaveLength(
      precincts.length + 4 /* precinct splits */ + 1
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
    const savedPrecinct = precincts.find(hasSplits)!;
    assert(savedPrecinct.splits.length === 2);

    const changedPrecinct: PrecinctWithoutSplits = {
      id: savedPrecinct.id,
      name: savedPrecinct.name,
      districtIds: savedPrecinct.splits[1].districtIds,
    };

    mockElectionFeatures(apiMock, electionId, {});
    apiMock.listPrecincts.expectCallWith({ electionId }).resolves(precincts);
    apiMock.listDistricts
      .expectCallWith({ electionId })
      .resolves(election.districts);
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Geography' });
    userEvent.click(screen.getByRole('tab', { name: 'Precincts' }));
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
      checked: false,
    });
    screen.getByRole('checkbox', {
      name: election.districts[2].name,
      checked: false,
    });

    apiMock.updatePrecinct
      .expectCallWith({ electionId, updatedPrecinct: changedPrecinct })
      .resolves();
    apiMock.listPrecincts
      .expectCallWith({ electionId })
      .resolves(
        precincts.map((p) =>
          p.id === changedPrecinct.id ? changedPrecinct : p
        )
      );
    // Districts haven't changed, but we are using coarse-grained invalidation
    apiMock.listDistricts
      .expectCallWith({ electionId })
      .resolves(election.districts);
    userEvent.type(screen.getByLabelText('Name'), '{enter}');

    await screen.findByRole('heading', { name: 'Geography' });
    expect(screen.getAllByRole('row')).toHaveLength(precincts.length + 1);
    const changedPrecinctRow = screen
      .getByText(changedPrecinct.name)
      .closest('tr')!;
    expect(
      within(changedPrecinctRow)
        .getAllByRole('cell')
        .map((td) => td.textContent)
    ).toEqual([changedPrecinct.name, election.districts[0].name, 'Edit']);
  });

  test('deleting a precinct', async () => {
    assert(precincts.length === 3);
    const [savedPrecinct] = precincts;

    mockElectionFeatures(apiMock, electionId, {});
    apiMock.listPrecincts.expectCallWith({ electionId }).resolves(precincts);
    apiMock.listDistricts
      .expectCallWith({ electionId })
      .resolves(election.districts);
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Geography' });
    userEvent.click(screen.getByRole('tab', { name: 'Precincts' }));
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
      .resolves(precincts.slice(1));
    // Districts haven't changed, but we are using coarse-grained invalidation
    apiMock.listDistricts
      .expectCallWith({ electionId })
      .resolves(election.districts);
    // Initiate the deletion
    userEvent.click(screen.getByRole('button', { name: 'Delete Precinct' }));
    // Confirm the deletion in the modal
    userEvent.click(screen.getByRole('button', { name: 'Delete Precinct' }));

    await screen.findByRole('heading', { name: 'Geography' });
    expect(screen.getAllByRole('row')).toHaveLength(
      precincts.length + 2 /* precinct splits */
    );
    expect(screen.queryByText(savedPrecinct.name)).not.toBeInTheDocument();
  });

  test('editing or adding a precinct is disabled when ballots are finalized', async () => {
    apiMock.getBallotsFinalizedAt.reset();
    apiMock.getBallotsFinalizedAt
      .expectCallWith({ electionId })
      .resolves(new Date());
    apiMock.listPrecincts.expectCallWith({ electionId }).resolves(precincts);
    apiMock.listDistricts
      .expectCallWith({ electionId })
      .resolves(election.districts);
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Geography' });
    userEvent.click(screen.getByRole('tab', { name: 'Precincts' }));
    await screen.findByText(precincts[0].name);
    expect(screen.getAllByRole('button', { name: 'Edit' })[0]).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add Precinct' })).toBeDisabled();
  });

  test('cancelling', async () => {
    mockElectionFeatures(apiMock, electionId, {});
    apiMock.listPrecincts.expectCallWith({ electionId }).resolves(precincts);
    apiMock.listDistricts
      .expectCallWith({ electionId })
      .resolves(election.districts);
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Geography' });
    userEvent.click(screen.getByRole('tab', { name: 'Precincts' }));
    userEvent.click(
      (await screen.findAllByRole('button', { name: 'Edit' }))[0]
    );

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
    await screen.findByRole('heading', { name: 'Geography' });
    screen.getByRole('tab', { name: 'Precincts', selected: true });
  });
});
