import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createMemoryHistory } from 'history';
import {
  DEFAULT_SYSTEM_SETTINGS,
  District,
  ElectionId,
  ElectionStringKey,
} from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { assertDefined, err, ok } from '@votingworks/basics';
import { readElectionGeneral } from '@votingworks/fixtures';
import {
  MockApiClient,
  createMockApiClient,
  mockStateFeatures,
  mockUserFeatures,
  provideApi,
  user,
} from '../test/api_helpers';
import { electionInfoFromElection } from '../test/fixtures';
import { makeIdFactory } from '../test/id_helpers';
import { withRoute } from '../test/routing_helpers';
import { routes } from './routes';
import { render, screen, within } from '../test/react_testing_library';
import { DistrictsScreen } from './districts_screen';
import { DistrictAudioPanel } from './district_audio_panel';

vi.mock('./district_audio_panel.js');
const MockAudioPanel = vi.mocked(DistrictAudioPanel);
const MOCK_AUDIO_PANEL_ID = 'MockDistrictAudioPanel';

let apiMock: MockApiClient;

const idFactory = makeIdFactory();

const electionGeneral = readElectionGeneral();

function renderScreen(electionId: ElectionId) {
  const { path } = routes.election(electionId).districts.root;
  const history = createMemoryHistory({ initialEntries: [path] });
  render(
    provideApi(
      apiMock,
      withRoute(<DistrictsScreen />, {
        history,
        paramPath: routes.election(':electionId').districts.root.path,
        path,
      })
    )
  );
  return history;
}

const election = electionGeneral;
const electionId = election.id;
const districtRoutes = routes.election(electionId).districts;

beforeEach(() => {
  apiMock = createMockApiClient();
  idFactory.reset();
  apiMock.getUser.expectCallWith().resolves(user);
  mockUserFeatures(apiMock);

  mockStateFeatures(apiMock, electionId);
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  apiMock.getElectionInfo
    .expectRepeatedCallsWith({ electionId })
    .resolves(electionInfoFromElection(election));
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(DEFAULT_SYSTEM_SETTINGS);

  MockAudioPanel.mockReturnValue(<div data-testid={MOCK_AUDIO_PANEL_ID} />);
});

afterEach(() => {
  apiMock.assertComplete();
});

test('adding districts to empty list', async () => {
  const newDistrict1: District = {
    id: idFactory.next(),
    name: 'New District 1',
  };
  const newDistrict2: District = {
    id: idFactory.next(),
    name: 'New District 2',
  };

  apiMock.listDistricts.expectCallWith({ electionId }).resolves([]);

  const history = renderScreen(electionId);

  await screen.findByRole('heading', { name: 'Districts' });
  screen.getByText("You haven't added any districts to this election yet.");
  expect(screen.getButton('Edit Districts')).toBeDisabled();

  // Add first district:
  userEvent.click(screen.getByRole('button', { name: 'Add District' }));
  await screen.findButton('Save');
  expect(history.location.pathname).toEqual(districtRoutes.edit.path);
  userEvent.type(screen.getByRole('textbox'), newDistrict1.name);

  // Add second district:
  userEvent.click(screen.getButton('Add District'));
  {
    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(2);
    userEvent.type(inputs[1], newDistrict2.name);
  }

  const updatedList = [newDistrict1, newDistrict2];
  expectDistrictInputs(updatedList);

  // Save and verify:

  expectUpdate(apiMock, { electionId, newDistricts: updatedList }).resolves(
    ok()
  );

  apiMock.listDistricts.expectCallWith({ electionId }).resolves(updatedList);

  userEvent.click(screen.getButton('Save'));

  await screen.findButton('Edit Districts');
  expectDistrictInputs(updatedList);
  expect(history.location.pathname).toEqual(districtRoutes.root.path);

  const inputs = screen.getAllByRole('textbox');
  expect(inputs).toHaveLength(2);
  expect(inputs[0]).toHaveValue(newDistrict1.name);
  expect(inputs[1]).toHaveValue(newDistrict2.name);
});

test('editing existing district list', async () => {
  const savedDistricts: District[] = [
    { id: 'saved-district-1', name: 'Saved District 1' },
    { id: 'saved-district-2', name: 'Saved District 2' },
    { id: 'saved-district-3', name: 'Saved District 3' },
  ];

  const preservedDistrict = savedDistricts[0];
  const deletedDistrict = savedDistricts[1];
  const newDistrict: District = { id: idFactory.next(), name: 'New District' };
  const updatedDistrict: District = {
    ...savedDistricts[2],
    name: 'Saved District 3 (Updated)',
  };

  apiMock.listDistricts.expectCallWith({ electionId }).resolves(savedDistricts);

  renderScreen(electionId);

  await screen.findButton('Edit Districts');
  expectDistrictInputs(savedDistricts);

  userEvent.click(screen.getButton('Edit Districts'));
  expect(screen.queryButton('Edit Districts')).not.toBeInTheDocument();

  // Delete second saved district:
  {
    const { name } = savedDistricts[1];
    userEvent.click(screen.getButton(`Delete District ${name}`));
    expectDistrictInputs([savedDistricts[0], savedDistricts[2]]);
  }

  // Update third saved district:
  {
    const input = screen.getByDisplayValue(savedDistricts[2].name);
    userEvent.clear(input);
    userEvent.type(input, updatedDistrict.name);
  }

  // Add new district:
  userEvent.click(screen.getButton('Add District'));
  {
    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(3);
    userEvent.type(inputs[2], newDistrict.name);
  }

  const updatedList = [preservedDistrict, updatedDistrict, newDistrict];
  expectDistrictInputs(updatedList);

  expectUpdate(apiMock, {
    electionId,
    deletedDistrictIds: [deletedDistrict.id],
    newDistricts: [newDistrict],
    updatedDistricts: [preservedDistrict, updatedDistrict],
  }).resolves(ok());

  apiMock.listDistricts.expectCallWith({ electionId }).resolves(updatedList);

  userEvent.click(screen.getButton('Save'));

  // Confirm district deletion
  const modal = await screen.findByRole('alertdialog');
  userEvent.click(
    within(modal).getByRole('button', { name: 'Delete District' })
  );

  await screen.findButton('Edit Districts');
  expectDistrictInputs(updatedList);
});

test('editing or adding a district is disabled when ballots are finalized', async () => {
  apiMock.getBallotsFinalizedAt.reset();
  apiMock.getBallotsFinalizedAt
    .expectCallWith({ electionId })
    .resolves(new Date());
  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves(election.districts);

  renderScreen(electionId);

  await screen.findByDisplayValue(election.districts[0].name);
  expect(screen.getButton('Add District')).toBeDisabled();
  expect(screen.queryButton('Edit Districts')).not.toBeInTheDocument();
  expect(screen.queryButton('Save')).not.toBeInTheDocument();
  expect(screen.queryButton('Cancel')).not.toBeInTheDocument();
});

test('cancelling', async () => {
  const newDistrictId = idFactory.next();
  const savedDistricts: District[] = [
    { id: 'saved-district-1', name: 'Saved District 1' },
    { id: 'saved-district-2', name: 'Saved District 2' },
    { id: 'saved-district-3', name: 'Saved District 3' },
  ];

  apiMock.listDistricts.expectCallWith({ electionId }).resolves(savedDistricts);

  const history = renderScreen(electionId);

  userEvent.click(await screen.findButton('Edit Districts'));
  expectDistrictInputs(savedDistricts);

  userEvent.click(screen.getButton(`Delete District Saved District 2`));
  userEvent.click(screen.getButton('Add District'));

  const inputs = screen.getAllByRole('textbox');
  userEvent.type(inputs[1], ' (Updated)');
  userEvent.type(inputs[2], 'New District');

  expectDistrictInputs([
    { id: 'saved-district-1', name: 'Saved District 1' },
    { id: 'saved-district-3', name: 'Saved District 3 (Updated)' },
    { id: newDistrictId, name: 'New District' },
  ]);

  userEvent.click(screen.getButton('Cancel'));

  await screen.findButton('Edit Districts');
  expectDistrictInputs(savedDistricts);
  expect(history.location.pathname).toEqual(districtRoutes.root.path);
});

test('error message for duplicate district name', async () => {
  const savedDistrict: District = { id: 'd1', name: 'District 1' };
  const newDistrict: District = { id: idFactory.next(), name: 'District 1' };

  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves([savedDistrict]);

  renderScreen(electionId);

  userEvent.click(await screen.findButton('Edit Districts'));
  userEvent.click(screen.getButton('Add District'));
  userEvent.type(screen.getAllByRole('textbox')[1], newDistrict.name);

  expectUpdate(apiMock, {
    electionId,
    newDistricts: [newDistrict],
    updatedDistricts: [savedDistrict],
  }).resolves(err({ code: 'duplicate-name', districtId: newDistrict.id }));

  userEvent.click(screen.getButton('Save'));

  await screen.findByText('There is already a district with the same name.');

  // Editing the problem district should clear the error:
  userEvent.type(screen.getAllByRole('textbox')[1], ' (edit)');
  expect(screen.queryByText(/with the same name/i)).not.toBeInTheDocument();
});

test('add/delete disabled for elections with external source', async () => {
  apiMock.getElectionInfo.reset();
  apiMock.getElectionInfo.expectRepeatedCallsWith({ electionId }).resolves({
    ...electionInfoFromElection(election),
    externalSource: 'ms-sems',
  });
  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves(election.districts);

  renderScreen(electionId);

  await screen.findByDisplayValue(election.districts[0].name);

  // Add District button should not be visible
  expect(screen.queryButton('Add District')).not.toBeInTheDocument();

  // Edit should be available but delete buttons should not be visible
  userEvent.click(screen.getButton('Edit Districts'));
  await screen.findButton('Save');

  expect(screen.queryButton(/Delete District/i)).not.toBeInTheDocument();
});

test('audio editing', async () => {
  const { districts } = election;
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);
  mockStateFeatures(apiMock, electionId, { AUDIO_ENABLED: true });

  const history = renderScreen(electionId);
  const editButton = await screen.findButton('Edit Districts');

  for (const district of districts) {
    const input = await screen.findByDisplayValue(district.name);
    const container = assertDefined(input.parentElement);
    const button = await within(container).findButton(/preview or edit audio/i);

    userEvent.click(button);

    await screen.findByTestId(MOCK_AUDIO_PANEL_ID);
    expect(history.location.pathname).toEqual(
      districtRoutes.audio({
        stringKey: ElectionStringKey.DISTRICT_NAME,
        subkey: district.id,
      })
    );
  }

  userEvent.click(editButton);
  expect(screen.queryByTestId(MOCK_AUDIO_PANEL_ID)).not.toBeInTheDocument();
  expect(screen.queryButton(/preview or edit audio/i)).not.toBeInTheDocument();
});

test('single district deletion', async () => {
  const districts: District[] = [
    { id: 'district-1', name: 'District 1' },
    { id: 'district-2', name: 'District 2' },
    { id: 'district-3', name: 'District 3' },
  ];
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);
  const history = renderScreen(electionId);

  userEvent.click(await screen.findButton('Edit Districts'));
  await screen.findButton('Save');

  // Delete one district and add one district
  userEvent.click(screen.getButton('Delete District District 2'));
  userEvent.click(screen.getButton('Add District'));
  const inputs = screen.getAllByRole('textbox');
  const newDistrict: District = { id: idFactory.next(), name: 'District 4' };
  userEvent.type(inputs[inputs.length - 1], newDistrict.name);
  const updatedDistrictList = [districts[0], districts[2], newDistrict];
  expectDistrictInputs(updatedDistrictList);

  userEvent.click(screen.getButton('Save'));
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Delete District' });
  within(modal).getByText(
    'Are you sure you want to delete district District 2?'
  );
  within(modal).getByText(
    'This will delete all contests associated with the district.'
  );
  within(modal).getByRole('button', { name: 'Cancel' });
  const deleteDistrictButton = within(modal).getByRole('button', {
    name: 'Delete District',
  });

  expectUpdate(apiMock, {
    electionId,
    deletedDistrictIds: [districts[1].id],
    newDistricts: [newDistrict],
    updatedDistricts: [districts[0], districts[2]],
  }).resolves(ok());
  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves(updatedDistrictList);
  userEvent.click(deleteDistrictButton);

  await screen.findButton('Edit Districts');
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(history.location.pathname).toEqual(districtRoutes.root.path);
  expectDistrictInputs(updatedDistrictList);
});

test('multiple district deletion', async () => {
  const districts: District[] = [
    { id: 'district-1', name: 'District 1' },
    { id: 'district-2', name: 'District 2' },
    { id: 'district-3', name: 'District 3' },
  ];
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);
  const history = renderScreen(electionId);

  userEvent.click(await screen.findButton('Edit Districts'));
  await screen.findButton('Save');

  // Delete two districts and add one district
  userEvent.click(screen.getButton('Delete District District 2'));
  userEvent.click(screen.getButton('Delete District District 3'));
  userEvent.click(screen.getButton('Add District'));
  const inputs = screen.getAllByRole('textbox');
  const newDistrict: District = { id: idFactory.next(), name: 'District 4' };
  userEvent.type(inputs[inputs.length - 1], newDistrict.name);
  const updatedDistrictList = [districts[0], newDistrict];
  expectDistrictInputs(updatedDistrictList);

  userEvent.click(screen.getButton('Save'));
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Delete Districts' });
  within(modal).getByText(
    'Are you sure you want to delete the following districts?'
  );
  within(modal).getByText('District 2');
  within(modal).getByText('District 3');
  within(modal).getByText(
    'This will delete all contests associated with these districts.'
  );
  within(modal).getByRole('button', { name: 'Cancel' });
  const deleteDistrictButton = within(modal).getByRole('button', {
    name: 'Delete Districts',
  });

  expectUpdate(apiMock, {
    electionId,
    deletedDistrictIds: [districts[1].id, districts[2].id],
    newDistricts: [newDistrict],
    updatedDistricts: [districts[0]],
  }).resolves(ok());
  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves(updatedDistrictList);
  userEvent.click(deleteDistrictButton);

  await screen.findButton('Edit Districts');
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(history.location.pathname).toEqual(districtRoutes.root.path);
  expectDistrictInputs(updatedDistrictList);
});

test('cancel district deletion', async () => {
  const districts: District[] = [
    { id: 'district-1', name: 'District 1' },
    { id: 'district-2', name: 'District 2' },
  ];
  apiMock.listDistricts.expectCallWith({ electionId }).resolves(districts);
  const history = renderScreen(electionId);

  userEvent.click(await screen.findButton('Edit Districts'));
  await screen.findButton('Save');

  userEvent.click(screen.getButton('Delete District District 1'));
  expectDistrictInputs([districts[1]]);

  userEvent.click(screen.getButton('Save'));
  const modal = await screen.findByRole('alertdialog');

  userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));

  await screen.findButton('Edit Districts');
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(history.location.pathname).toEqual(districtRoutes.root.path);
  expectDistrictInputs(districts);
});

function expectDistrictInputs(districts: District[]) {
  const inputs = screen.getAllByRole('textbox');
  const inputValues = inputs.map((i) => (i as HTMLInputElement).value);
  const districtNames = districts.map((d) => d.name);
  expect(inputValues).toEqual(districtNames);
}

function expectUpdate(
  mockApi: MockApiClient,
  input: {
    electionId: string;
    newDistricts?: District[];
    updatedDistricts?: District[];
    deletedDistrictIds?: string[];
  }
) {
  return mockApi.updateDistricts.expectCallWith({
    newDistricts: [],
    deletedDistrictIds: [],
    updatedDistricts: [],
    ...input,
  });
}
