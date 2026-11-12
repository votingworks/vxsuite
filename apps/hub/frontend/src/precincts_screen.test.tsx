import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { makeIdFactory } from '@votingworks/test-utils';
import { createMemoryHistory, type MemoryHistory } from 'history';
import {
  DEFAULT_SYSTEM_SETTINGS,
  type ElectionId,
  ElectionStringKey,
  type Precinct,
} from '@votingworks/types';
import { userEvent } from '@testing-library/user-event';
import { assertDefined, ok } from '@votingworks/basics';
import {
  type MockApiClient,
  createMockApiClient,
  mockStateFeatures,
  mockUserFeatures,
  jurisdiction,
  provideApi,
  user,
} from '../test/api_helpers.js';
import {
  electionInfoFromElection,
  generalElectionRecord,
} from '../test/fixtures.js';
import { withRoute } from '../test/routing_helpers.js';
import { routes } from './routes.js';
import {
  render,
  screen,
  waitFor,
  within,
} from '../test/react_testing_library.js';
import { PrecinctsScreen } from './precincts_screen.js';
import { PrecinctAudioPanel } from './precinct_audio_panel.js';

vi.mock('./precinct_audio_panel.js');
const MockPrecinctAudioPanel = vi.mocked(PrecinctAudioPanel);
const MOCK_AUDIO_PANEL_ID = 'MockPrecinctAudioPanel';

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
        history,
        paramPath: routes.election(':electionId').precincts.root.path,
        path,
      })
    )
  );

  return history;
}

const { election } = generalElectionRecord(jurisdiction.id);
const electionId = election.id;
const precinctRoutes = routes.election(electionId).precincts;

beforeEach(() => {
  mockStateFeatures(apiMock, electionId);
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  apiMock.getElectionInfo
    .expectRepeatedCallsWith({ electionId })
    .resolves(electionInfoFromElection(election));
  apiMock.getSystemSettings
    .expectCallWith({ electionId })
    .resolves(DEFAULT_SYSTEM_SETTINGS);
  apiMock.getRegisteredVoterCounts
    .expectRepeatedCallsWith({ electionId })
    .resolves({});

  MockPrecinctAudioPanel.mockReturnValue(
    <div data-testid={MOCK_AUDIO_PANEL_ID} />
  );
});

test('adding a precinct', async () => {
  idFactory.next(); // Discarded by StrictMode's double render of the blank form
  const newPrecinct: Precinct = {
    id: idFactory.next(),
    name: 'New Precinct',
    districtIds: [election.districts[0]!.id, election.districts[1]!.id],
  };

  apiMock.listPrecincts.expectCallWith({ electionId }).resolves([]);
  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves(election.districts);

  const history = renderScreen(electionId);

  await screen.findByRole('heading', { name: 'Precincts' });
  await userEvent.click(await screen.findButton('Add Precinct'));
  await screen.findByRole('heading', { name: 'Add Precinct' });
  expect(history.location.pathname).toEqual(`${precinctRoutes.root.path}/add`);

  await userEvent.type(screen.getByLabelText('Name'), newPrecinct.name);

  for (const districtId of newPrecinct.districtIds) {
    await userEvent.click(
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
  apiMock.listPrecincts
    .expectRepeatedCallsWith({ electionId })
    .resolves([newPrecinct]);
  // Districts haven't changed, but we are using coarse-grained invalidation
  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves(election.districts);
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await expectViewModePrecinct(history, newPrecinct);
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

  const history = renderScreen(electionId);

  await expectViewModePrecinct(history, election.precincts[0]!);
  expect(screen.queryButton('Edit')).not.toBeInTheDocument();
  expect(screen.queryButton('Save')).not.toBeInTheDocument();
  expect(screen.queryButton('Cancel')).not.toBeInTheDocument();
  expect(screen.queryButton('Delete Precinct')).not.toBeInTheDocument();

  const precinct2 = election.precincts[1]!;

  // Accessing `/edit` route when finalized should redirect to "view" route:
  history.replace(`${precinctRoutes.view(precinct2.id).path}/edit`);
  await waitFor(() => expectViewModePrecinct(history, precinct2));
  expect(screen.queryButton('Edit')).not.toBeInTheDocument();
  expect(screen.queryButton('Save')).not.toBeInTheDocument();
  expect(screen.queryButton('Cancel')).not.toBeInTheDocument();
  expect(screen.queryButton('Delete Precinct')).not.toBeInTheDocument();
});

describe('audio editing', () => {
  const precinct: Precinct = {
    id: 'precinct-1',
    name: 'Precinct With Splits',
    splits: [
      { id: 'split-1', name: 'Split 1', districtIds: [] },
      { id: 'split-2', name: 'Split 2', districtIds: [] },
    ],
  };

  interface AudioEnabledInputSpec {
    inputValue: string;
    stringKey: ElectionStringKey;
    subkey: string;
    testLabel: string;
  }

  for (const spec of [
    {
      testLabel: 'precinct name',
      inputValue: precinct.name,
      stringKey: ElectionStringKey.PRECINCT_NAME,
      subkey: precinct.id,
    },
    {
      testLabel: 'first precinct split',
      inputValue: precinct.splits[0]!.name,
      stringKey: ElectionStringKey.PRECINCT_SPLIT_NAME,
      subkey: precinct.splits[0]!.id,
    },
    {
      testLabel: 'second precinct split',
      inputValue: precinct.splits[1]!.name,
      stringKey: ElectionStringKey.PRECINCT_SPLIT_NAME,
      subkey: precinct.splits[1]!.id,
    },
  ] as AudioEnabledInputSpec[]) {
    test(`configures audio edit button for ${spec.testLabel}`, async () => {
      apiMock.listPrecincts.expectCallWith({ electionId }).resolves([precinct]);
      apiMock.listDistricts.expectCallWith({ electionId }).resolves([]);

      mockStateFeatures(apiMock, electionId, { AUDIO_ENABLED: true });
      const history = renderScreen(electionId);

      const input = await screen.findByDisplayValue(spec.inputValue);
      const inputGroup = assertDefined(input.closest('label'));
      const button = within(inputGroup).getButton(/preview or edit audio/i);

      await userEvent.click(button);

      await screen.findByTestId(MOCK_AUDIO_PANEL_ID);
      expect(history.location.pathname).toEqual(
        `${precinctRoutes.view(precinct.id).path}/audio/${spec.stringKey}/${spec.subkey}`
      );
    });
  }
});

async function expectViewModePrecinct(
  history: MemoryHistory,
  precinct: Precinct
) {
  await screen.findByRole('heading', { name: 'Precinct Info' });
  screen.getByRole('listbox');
  expect(history.location.pathname).toEqual(
    precinctRoutes.view(precinct.id).path
  );
}
