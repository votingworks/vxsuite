import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createMemoryHistory } from 'history';
import {
  DEFAULT_SYSTEM_SETTINGS,
  type District,
  type ElectionId,
  ElectionStringKey,
} from '@votingworks/types';
import { userEvent } from '@testing-library/user-event';
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
import { makeIdFactory } from '../test/id_helpers.js';
import { withRoute } from '../test/routing_helpers.js';
import { routes } from './routes.js';
import { render, screen, within } from '../test/react_testing_library.js';
import { DistrictsScreen } from './districts_screen.js';
import { DistrictAudioPanel } from './district_audio_panel.js';

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

  apiMock.getStateFeatures
    .expectOptionalRepeatedCallsWith({ electionId })
    .resolves({});
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
  await screen.findByText(
    "You haven't added any districts to this election yet."
  );
  expect(screen.getButton('Edit Districts')).toBeDisabled();

  // Add first district:
  await userEvent.click(screen.getByRole('button', { name: 'Add District' }));
  await screen.findButton('Save');
  expect(history.location.pathname).toEqual(`${districtRoutes.root.path}/edit`);
  await userEvent.type(screen.getByRole('textbox'), newDistrict1.name);

  // Add second district:
  await userEvent.click(screen.getButton('Add District'));
  {
    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(2);
    await userEvent.type(inputs[1]!, newDistrict2.name);
  }

  const updatedList = [newDistrict1, newDistrict2];
  expectDistrictInputs(updatedList);

  // Save and verify:

  expectUpdate(apiMock, { electionId, newDistricts: updatedList }).resolves(
    ok()
  );

  apiMock.listDistricts.expectCallWith({ electionId }).resolves(updatedList);

  await userEvent.click(screen.getButton('Save'));

  await screen.findButton('Edit Districts');
  expectDistrictInputs(updatedList);
  expect(history.location.pathname).toEqual(districtRoutes.root.path);

  const inputs = screen.getAllByRole('textbox');
  expect(inputs).toHaveLength(2);
  expect(inputs[0]).toHaveValue(newDistrict1.name);
  expect(inputs[1]).toHaveValue(newDistrict2.name);
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

  await screen.findByDisplayValue(election.districts[0]!.name);
  expect(screen.getButton('Add District')).toBeDisabled();
  expect(screen.queryButton('Edit Districts')).not.toBeInTheDocument();
  expect(screen.queryButton('Save')).not.toBeInTheDocument();
  expect(screen.queryButton('Cancel')).not.toBeInTheDocument();
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

    await userEvent.click(button);

    await screen.findByTestId(MOCK_AUDIO_PANEL_ID);
    expect(history.location.pathname).toEqual(
      `${districtRoutes.root.path}/audio/${ElectionStringKey.DISTRICT_NAME}/${district.id}`
    );
  }

  await userEvent.click(editButton);
  expect(screen.queryByTestId(MOCK_AUDIO_PANEL_ID)).not.toBeInTheDocument();
  expect(screen.queryButton(/preview or edit audio/i)).not.toBeInTheDocument();
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
