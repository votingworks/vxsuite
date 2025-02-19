import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  ElectionRecord,
  Precinct,
  PrecinctWithSplits,
  PrecinctWithoutSplits,
} from '@votingworks/design-backend';
import { Buffer } from 'node:buffer';
import { createMemoryHistory } from 'history';
import { District, DistrictId, ElectionId } from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { assert, assertDefined } from '@votingworks/basics';
import { readElectionGeneral } from '@votingworks/fixtures';
import {
  MockApiClient,
  createMockApiClient,
  nonVxUser,
  provideApi,
  vxUser,
} from '../test/api_helpers';
import { generalElectionRecord, makeElectionRecord } from '../test/fixtures';
import { makeIdFactory } from '../test/id_helpers';
import { withRoute } from '../test/routing_helpers';
import { routes } from './routes';
import { render, screen, waitFor, within } from '../test/react_testing_library';
import { GeographyScreen } from './geography_screen';
import { hasSplits } from './utils';

let apiMock: MockApiClient;

const idFactory = makeIdFactory();

beforeEach(() => {
  apiMock = createMockApiClient();
  idFactory.reset();
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
      }),
      electionId
    )
  );
  return history;
}

const electionGeneral = readElectionGeneral();
const electionWithNoGeographyRecord: ElectionRecord = makeElectionRecord(
  {
    ...electionGeneral,
    districts: [],
    precincts: [],
  },
  nonVxUser.orgId
);

const electionWithNoPrecinctsRecord: ElectionRecord = makeElectionRecord(
  {
    ...electionGeneral,
    precincts: [],
  },
  nonVxUser.orgId
);

describe('Districts tab', () => {
  test('adding a district', async () => {
    const { election } = electionWithNoGeographyRecord;
    const electionId = election.id;
    const newDistrict: District = {
      id: idFactory.next() as DistrictId,
      name: 'New District',
    };

    apiMock.getUser.expectRepeatedCallsWith().resolves(vxUser);
    apiMock.getElection
      .expectCallWith({ user: vxUser, electionId })
      .resolves(electionWithNoGeographyRecord);
    apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Geography' });
    screen.getByRole('tab', { name: 'Districts', selected: true });
    screen.getByText("You haven't added any districts to this election yet.");

    userEvent.click(screen.getByRole('button', { name: 'Add District' }));
    await screen.findByRole('heading', { name: 'Add District' });

    userEvent.type(screen.getByLabelText('Name'), newDistrict.name);

    const electionWithNewDistrictRecord: ElectionRecord = {
      ...electionWithNoGeographyRecord,
      election: { ...election, districts: [newDistrict] },
    };
    apiMock.updateElection
      .expectCallWith({
        electionId,
        election: electionWithNewDistrictRecord.election,
      })
      .resolves();
    apiMock.getElection
      .expectCallWith({ user: vxUser, electionId })
      .resolves(electionWithNewDistrictRecord);
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
    const electionRecord = generalElectionRecord(nonVxUser.orgId);
    const { election } = electionRecord;
    const electionId = election.id;
    const savedDistrict = election.districts[0];
    const changedDistrict: District = {
      ...savedDistrict,
      name: 'Changed District',
    };

    apiMock.getUser.expectRepeatedCallsWith().resolves(nonVxUser);
    apiMock.getElection
      .expectCallWith({ user: nonVxUser, electionId })
      .resolves(electionRecord);
    apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Geography' });
    screen.getByRole('tab', { name: 'Districts', selected: true });
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(election.districts.length + 1);

    const savedContestRow = screen.getByText(savedDistrict.name).closest('tr')!;
    const contestRowIndex = rows.indexOf(savedContestRow);
    userEvent.click(
      within(savedContestRow).getByRole('button', { name: 'Edit' })
    );

    await screen.findByRole('heading', { name: 'Edit District' });

    const nameInput = screen.getByLabelText('Name');
    expect(nameInput).toHaveValue(savedDistrict.name);
    userEvent.clear(nameInput);
    userEvent.type(nameInput, changedDistrict.name);

    const electionWithChangedDistrictRecord: ElectionRecord = {
      ...electionRecord,
      election: {
        ...election,
        districts: [changedDistrict, ...election.districts.slice(1)],
      },
    };
    apiMock.updateElection
      .expectCallWith({
        electionId,
        election: electionWithChangedDistrictRecord.election,
      })
      .resolves();
    apiMock.getElection
      .expectCallWith({ user: nonVxUser, electionId })
      .resolves(electionWithChangedDistrictRecord);
    userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByRole('heading', { name: 'Geography' });
    screen.getByRole('tab', { name: 'Districts', selected: true });

    const changedContestRow = screen.getAllByRole('row')[contestRowIndex];
    within(changedContestRow).getByText(changedDistrict.name);
  });

  test('deleting a district', async () => {
    const electionRecord = generalElectionRecord(nonVxUser.orgId);
    const { election } = electionRecord;
    const electionId = election.id;
    assert(election.districts.length === 3);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [savedDistrict, remainingDistrict, unusedDistrict] =
      election.districts;

    apiMock.getUser.expectRepeatedCallsWith().resolves(vxUser);
    apiMock.getElection
      .expectCallWith({ user: vxUser, electionId })
      .resolves(electionRecord);
    apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
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

    // Writing out by hand the expected precincts after deleting the district to
    // avoid replicating the logic we're trying to test (which removes the
    // deleted district from any precincts/splits that reference it)
    assert(electionRecord.precincts.length === 3);
    assert(hasSplits(electionRecord.precincts[1]));
    const precinctsWithDeletedDistrict: Precinct[] = [
      {
        ...electionRecord.precincts[0],
        districtIds: [remainingDistrict.id],
      },
      {
        ...electionRecord.precincts[1],
        splits: [
          {
            ...electionRecord.precincts[1].splits[0],
            districtIds: [remainingDistrict.id],
          },
          {
            ...electionRecord.precincts[1].splits[1],
            districtIds: [],
          },
        ],
      },
      {
        ...electionRecord.precincts[2],
        districtIds: [],
      },
    ];
    const electionWithDeletedDistrictRecord: ElectionRecord = {
      ...electionRecord,
      election: {
        ...election,
        districts: election.districts.filter(
          (district) => district.id !== savedDistrict.id
        ),
      },
      precincts: precinctsWithDeletedDistrict,
    };
    apiMock.updateElection
      .expectCallWith({
        electionId,
        election: electionWithDeletedDistrictRecord.election,
      })
      .resolves();
    apiMock.updatePrecincts
      .expectCallWith({
        electionId,
        precincts: precinctsWithDeletedDistrict,
      })
      .resolves();
    apiMock.getElection
      .expectCallWith({ user: vxUser, electionId })
      .resolves(electionWithDeletedDistrictRecord);
    // Two mutations cause two refetches
    apiMock.getElection
      .expectCallWith({ user: vxUser, electionId })
      .resolves(electionWithDeletedDistrictRecord);
    // Initiate the deletion
    userEvent.click(screen.getByRole('button', { name: 'Delete District' }));
    // Confirm the deletion in the modal
    userEvent.click(screen.getByRole('button', { name: 'Delete District' }));

    await screen.findByRole('heading', { name: 'Geography' });
    expect(screen.getAllByRole('row')).toHaveLength(
      electionWithDeletedDistrictRecord.election.districts.length + 1
    );
    expect(screen.queryByText(savedDistrict.name)).not.toBeInTheDocument();
  });

  test('editing or adding a district is disabled when ballots are finalized', async () => {
    const electionRecord = generalElectionRecord(nonVxUser.orgId);
    const { election } = electionRecord;
    const electionId = election.id;
    const savedDistrict = election.districts[0];

    apiMock.getUser.expectRepeatedCallsWith().resolves(vxUser);
    apiMock.getElection
      .expectCallWith({ user: vxUser, electionId })
      .resolves(electionRecord);
    apiMock.getBallotsFinalizedAt
      .expectCallWith({ electionId })
      .resolves(new Date());
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Geography' });
    screen.getByRole('tab', { name: 'Districts', selected: true });
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(election.districts.length + 1);

    const savedContestRow = screen.getByText(savedDistrict.name).closest('tr')!;
    expect(
      within(savedContestRow).getByRole('button', { name: 'Edit' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add District' })).toBeDisabled();
  });
});

describe('Precincts tab', () => {
  test('adding a precinct', async () => {
    const { election } = electionWithNoPrecinctsRecord;
    const electionId = election.id;
    const newPrecinct: Precinct = {
      id: idFactory.next(),
      name: 'New Precinct',
      districtIds: [election.districts[0].id, election.districts[1].id],
    };

    apiMock.getUser.expectRepeatedCallsWith().resolves(vxUser);
    apiMock.getElection
      .expectCallWith({ user: vxUser, electionId })
      .resolves(electionWithNoPrecinctsRecord);
    apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Geography' });
    userEvent.click(screen.getByRole('tab', { name: 'Precincts' }));
    screen.getByText("You haven't added any precincts to this election yet.");

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

    const electionWithNewPrecinctRecord: ElectionRecord = {
      ...electionWithNoPrecinctsRecord,
      election, // Don't update the election, since it's not used here and it's hard to update ballot styles correctly
      precincts: [newPrecinct],
    };
    apiMock.updatePrecincts
      .expectCallWith({
        electionId,
        precincts: [newPrecinct],
      })
      .resolves();
    apiMock.getElection
      .expectCallWith({ user: vxUser, electionId })
      .resolves(electionWithNewPrecinctRecord);
    userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByRole('heading', { name: 'Geography' });
    screen.getByRole('tab', { name: 'Precincts', selected: true });
    expect(
      screen.getAllByRole('columnheader').map((th) => th.textContent)
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
    const general = generalElectionRecord(nonVxUser.orgId);
    const nhElectionRecord: ElectionRecord = {
      ...general,
      election: { ...general.election, state: 'New Hampshire' },
    };
    const { election, precincts } = nhElectionRecord;
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

    apiMock.getUser.expectRepeatedCallsWith().resolves(vxUser);
    apiMock.getElection
      .expectCallWith({ user: vxUser, electionId })
      .resolves(nhElectionRecord);
    apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Geography' });
    userEvent.click(screen.getByRole('tab', { name: 'Precincts' }));
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

    const electionWithChangedPrecinctRecord: ElectionRecord = {
      ...general,
      election, // Don't update the election, since it's not used here and it's hard to update ballot styles correctly
      precincts: precincts.map((precinct) =>
        precinct.id === changedPrecinct.id ? changedPrecinct : precinct
      ),
    };
    apiMock.updatePrecincts
      .expectCallWith({
        electionId,
        precincts: electionWithChangedPrecinctRecord.precincts,
      })
      .resolves();
    apiMock.getElection
      .expectCallWith({ user: vxUser, electionId })
      .resolves(electionWithChangedPrecinctRecord);
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
    const electionRecord = generalElectionRecord(nonVxUser.orgId);
    const { election, precincts } = electionRecord;
    const electionId = election.id;
    const savedPrecinct = precincts.find(hasSplits)!;
    assert(savedPrecinct.splits.length === 2);

    const changedPrecinct: PrecinctWithoutSplits = {
      id: savedPrecinct.id,
      name: savedPrecinct.name,
      districtIds: savedPrecinct.splits[1].districtIds,
    };

    apiMock.getUser.expectRepeatedCallsWith().resolves(vxUser);
    apiMock.getElection
      .expectCallWith({ user: vxUser, electionId })
      .resolves(electionRecord);
    apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Geography' });
    userEvent.click(screen.getByRole('tab', { name: 'Precincts' }));
    const savedPrecinctRow = screen
      .getByText(savedPrecinct.name)
      .closest('tr')!;
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

    const electionWithChangedPrecinctRecord: ElectionRecord = {
      ...electionRecord,
      election, // Don't update the election, since it's not used here and it's hard to update ballot styles correctly
      precincts: precincts.map((precinct) =>
        precinct.id === changedPrecinct.id ? changedPrecinct : precinct
      ),
    };
    apiMock.updatePrecincts
      .expectCallWith({
        electionId,
        precincts: electionWithChangedPrecinctRecord.precincts,
      })
      .resolves();
    apiMock.getElection
      .expectCallWith({ user: vxUser, electionId })
      .resolves(electionWithChangedPrecinctRecord);
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
    const electionRecord = generalElectionRecord(nonVxUser.orgId);
    const { election, precincts } = electionRecord;
    const electionId = election.id;
    assert(precincts.length === 3);
    const [savedPrecinct] = precincts;

    apiMock.getUser.expectRepeatedCallsWith().resolves(vxUser);
    apiMock.getElection
      .expectCallWith({ user: vxUser, electionId })
      .resolves(electionRecord);
    apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Geography' });
    userEvent.click(screen.getByRole('tab', { name: 'Precincts' }));
    const savedPrecinctRow = screen
      .getByText(savedPrecinct.name)
      .closest('tr')!;
    userEvent.click(
      within(savedPrecinctRow).getByRole('button', { name: 'Edit' })
    );

    await screen.findByRole('heading', { name: 'Edit Precinct' });

    const electionWithDeletedPrecinctRecord: ElectionRecord = {
      ...electionRecord,
      election, // Don't update the election, since it's not used here and it's hard to update ballot styles correctly
      precincts: precincts.filter(
        (precinct) => precinct.id !== savedPrecinct.id
      ),
    };
    apiMock.updatePrecincts
      .expectCallWith({
        electionId,
        precincts: electionWithDeletedPrecinctRecord.precincts,
      })
      .resolves();
    apiMock.getElection
      .expectCallWith({ user: vxUser, electionId })
      .resolves(electionWithDeletedPrecinctRecord);
    // Initiate the deletion
    userEvent.click(screen.getByRole('button', { name: 'Delete Precinct' }));
    // Confirm the deletion in the modal
    userEvent.click(screen.getByRole('button', { name: 'Delete Precinct' }));

    await screen.findByRole('heading', { name: 'Geography' });
    expect(screen.getAllByRole('row')).toHaveLength(
      electionWithDeletedPrecinctRecord.precincts.length +
        2 /* precinct splits */ +
        1
    );
    expect(screen.queryByText(savedPrecinct.name)).not.toBeInTheDocument();
  });
});
