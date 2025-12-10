import { afterEach, beforeEach, expect, test } from 'vitest';
import { createMemoryHistory } from 'history';
import {
  DEFAULT_SYSTEM_SETTINGS,
  District,
  ElectionId,
} from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { assert, err, ok } from '@votingworks/basics';
import { readElectionGeneral } from '@votingworks/fixtures';
import {
  MockApiClient,
  createMockApiClient,
  mockUserFeatures,
  provideApi,
  user,
} from '../test/api_helpers';
import { makeIdFactory } from '../test/id_helpers';
import { withRoute } from '../test/routing_helpers';
import { routes } from './routes';
import { render, screen, waitFor, within } from '../test/react_testing_library';
import { DistrictsScreen } from './districts_screen';

let apiMock: MockApiClient;

const idFactory = makeIdFactory();

const electionGeneral = readElectionGeneral();

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
  const { path } = routes.election(electionId).districts.root;
  const history = createMemoryHistory({ initialEntries: [path] });
  render(
    provideApi(
      apiMock,
      withRoute(<DistrictsScreen />, {
        paramPath: routes.election(':electionId').districts.root.path,
        path,
      })
    )
  );
  return history;
}

const election = electionGeneral;
const electionId = election.id;
beforeEach(() => {
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(DEFAULT_SYSTEM_SETTINGS);
});

test('adding a district', async () => {
  const newDistrict: District = {
    id: idFactory.next(),
    name: 'New District',
  };

  apiMock.listDistricts.expectCallWith({ electionId }).resolves([]);
  renderScreen(electionId);

  await screen.findByRole('heading', { name: 'Districts' });
  screen.getByText("You haven't added any districts to this election yet.");

  userEvent.click(screen.getByRole('button', { name: 'Add District' }));
  await screen.findByRole('heading', { name: 'Add District' });
  expect(screen.getByRole('link', { name: 'Districts' })).toHaveAttribute(
    'href',
    `/elections/${electionId}/districts`
  );

  userEvent.type(screen.getByLabelText('Name'), newDistrict.name);

  apiMock.createDistrict
    .expectCallWith({ electionId, newDistrict })
    .resolves(ok());
  apiMock.listDistricts.expectCallWith({ electionId }).resolves([newDistrict]);
  userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await screen.findByRole('heading', { name: 'Districts' });
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

  await screen.findByRole('heading', { name: 'Districts' });
  const rows = screen.getAllByRole('row');
  expect(rows).toHaveLength(election.districts.length + 1);

  const savedDistrictRow = screen.getByText(savedDistrict.name).closest('tr')!;
  const contestRowIndex = rows.indexOf(savedDistrictRow);
  userEvent.click(
    within(savedDistrictRow).getByRole('button', { name: 'Edit' })
  );

  await screen.findByRole('heading', { name: 'Edit District' });
  expect(screen.getByRole('link', { name: 'Districts' })).toHaveAttribute(
    'href',
    `/elections/${electionId}/districts`
  );

  const nameInput = screen.getByLabelText('Name');
  expect(nameInput).toHaveValue(savedDistrict.name);
  userEvent.clear(nameInput);
  userEvent.type(nameInput, updatedDistrict.name);

  apiMock.updateDistrict
    .expectCallWith({ electionId, updatedDistrict })
    .resolves(ok());
  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves([updatedDistrict, ...election.districts.slice(1)]);
  userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await screen.findByRole('heading', { name: 'Districts' });

  const updatedDistrictRow = screen.getAllByRole('row')[contestRowIndex];
  within(updatedDistrictRow).getByText(updatedDistrict.name);
});

test('deleting a district', async () => {
  assert(election.districts.length === 3);

  const [savedDistrict, remainingDistrict, unusedDistrict] = election.districts;

  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves(election.districts);
  renderScreen(electionId);

  await screen.findByRole('heading', { name: 'Districts' });
  const rows = screen.getAllByRole('row');
  expect(rows).toHaveLength(election.districts.length + 1);
  const savedDistrictRow = screen.getByText(savedDistrict.name).closest('tr')!;
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

  await screen.findByRole('heading', { name: 'Districts' });
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

  await screen.findByRole('heading', { name: 'Districts' });
  const rows = screen.getAllByRole('row');
  expect(rows).toHaveLength(election.districts.length + 1);

  const savedDistrictRow = screen.getByText(savedDistrict.name).closest('tr')!;
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

  await screen.findByRole('heading', { name: 'Districts' });
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
  await screen.findByRole('heading', { name: 'Districts' });
});

test('error message for duplicate district name', async () => {
  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves(election.districts);
  renderScreen(electionId);
  await screen.findByRole('heading', { name: 'Districts' });

  userEvent.click(screen.getByRole('button', { name: 'Add District' }));
  await screen.findByRole('heading', { name: 'Add District' });
  userEvent.type(screen.getByLabelText('Name'), election.districts[0].name);

  apiMock.createDistrict
    .expectCallWith({
      electionId,
      newDistrict: {
        id: idFactory.next(),
        name: election.districts[0].name,
      },
    })
    .resolves(err('duplicate-name'));
  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('There is already a district with the same name.');

  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await screen.findByRole('heading', { name: 'Districts' });
  userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);

  await screen.findByRole('heading', { name: 'Edit District' });
  const nameInput = screen.getByLabelText('Name');
  expect(nameInput).toHaveValue(election.districts[0].name);
  userEvent.clear(nameInput);
  userEvent.type(nameInput, election.districts[1].name);

  apiMock.updateDistrict
    .expectCallWith({
      electionId,
      updatedDistrict: {
        id: election.districts[0].id,
        name: election.districts[1].name,
      },
    })
    .resolves(err('duplicate-name'));
  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('There is already a district with the same name.');
});
