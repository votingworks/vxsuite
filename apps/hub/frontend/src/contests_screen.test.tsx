import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createMemoryHistory } from 'history';
import {
  DEFAULT_SYSTEM_SETTINGS,
  ElectionStringKey,
  type YesNoContest,
} from '@votingworks/types';
import { assertDefined, find, ok } from '@votingworks/basics';
import { userEvent } from '@testing-library/user-event';
import type {
  ElectionInfo,
  StateFeaturesConfig,
} from '@votingworks/hub-backend';
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
import { ContestsScreen } from './contests_screen.js';
import { ContestAudioPanel } from './contest_audio_panel.js';

vi.mock('./contest_audio_panel.js');
const MockAudioPanel = vi.mocked(ContestAudioPanel);
const MOCK_AUDIO_PANEL_ID = 'MockContestAudioPanel';

const { election } = generalElectionRecord(jurisdiction.id);
const electionId = election.id;
const contestRoutes = routes.election(electionId).contests;
const ballotMeasure = find(
  election.contests,
  (contest): contest is YesNoContest => contest.type === 'yesno'
);

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
  MockAudioPanel.mockReturnValue(<div data-testid={MOCK_AUDIO_PANEL_ID} />);
});

afterEach(() => {
  apiMock.assertComplete();
});

function mockScreenDependencies(
  features: StateFeaturesConfig = {},
  finalizedAt: Date | null = null,
  electionInfo: ElectionInfo = electionInfoFromElection(election)
) {
  mockUserFeatures(apiMock);
  mockStateFeatures(apiMock, electionId, features);
  apiMock.getUser.expectCallWith().resolves(user);
  apiMock.getElectionInfo
    .expectRepeatedCallsWith({ electionId })
    .resolves(electionInfo);
  apiMock.getSystemSettings
    .expectRepeatedCallsWith({ electionId })
    .resolves(DEFAULT_SYSTEM_SETTINGS);
  apiMock.listDistricts
    .expectRepeatedCallsWith({ electionId })
    .resolves(election.districts);
  apiMock.listParties
    .expectRepeatedCallsWith({ electionId })
    .resolves(election.parties);
  apiMock.getBallotsFinalizedAt
    .expectCallWith({ electionId })
    .resolves(finalizedAt);
}

function renderScreen(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  render(
    provideApi(
      apiMock,
      withRoute(<ContestsScreen />, {
        history,
        paramPath: routes.election(':electionId').contests.root.path,
        path,
      })
    )
  );
  return history;
}

test('editing a ballot measure', async () => {
  mockScreenDependencies();
  apiMock.listContests
    .expectRepeatedCallsWith({ electionId })
    .resolves(election.contests);

  const history = renderScreen(contestRoutes.view(ballotMeasure.id).path);
  await screen.findByRole('heading', { name: 'Contests' });
  await userEvent.click(await screen.findButton('Edit'));
  await screen.findByRole('heading', { name: 'Edit Contest' });
  expect(history.location.pathname).toEqual(
    `${contestRoutes.view(ballotMeasure.id).path}/edit`
  );

  const titleInput = screen.getByLabelText('Title');
  await userEvent.clear(titleInput);
  await userEvent.type(titleInput, 'Edited Title');

  const updatedContest: YesNoContest = {
    ...ballotMeasure,
    title: 'Edited Title',
  };
  apiMock.updateContest
    .expectCallWith({ electionId, updatedContest })
    .resolves(ok());
  apiMock.listContests.reset();
  apiMock.listContests
    .expectRepeatedCallsWith({ electionId })
    .resolves(
      election.contests.map((contest) =>
        contest.id === updatedContest.id ? updatedContest : contest
      )
    );
  await userEvent.click(screen.getButton('Save'));

  await screen.findByRole('heading', { name: 'Contest Info' });
  expect(history.location.pathname).toEqual(
    contestRoutes.view(ballotMeasure.id).path
  );
  expect(screen.getByLabelText('Title')).toHaveValue('Edited Title');
});

test('editing or adding a contest is disabled when ballots are finalized', async () => {
  mockScreenDependencies(undefined, new Date());
  apiMock.listContests
    .expectRepeatedCallsWith({ electionId })
    .resolves(election.contests);

  const history = renderScreen(
    `${contestRoutes.view(ballotMeasure.id).path}/edit`
  );

  await screen.findByRole('heading', { name: 'Contest Info' });
  await waitFor(() =>
    expect(history.location.pathname).toEqual(
      contestRoutes.view(ballotMeasure.id).path
    )
  );
  expect(screen.getButton('Add Contest')).toBeDisabled();
  expect(screen.getButton('Reorder Contests')).toBeDisabled();
  expect(screen.queryButton('Edit')).not.toBeInTheDocument();
  expect(screen.queryButton('Delete Contest')).not.toBeInTheDocument();
});

test('configures the audio edit button for the contest title', async () => {
  mockScreenDependencies({ AUDIO_ENABLED: true });
  apiMock.listContests
    .expectRepeatedCallsWith({ electionId })
    .resolves(election.contests);

  const history = renderScreen(contestRoutes.view(ballotMeasure.id).path);

  const labelText = await screen.findByText('Title');
  const inputGroup = assertDefined(labelText.parentElement);
  await userEvent.click(within(inputGroup).getButton(/preview or edit audio/i));

  await screen.findByTestId(MOCK_AUDIO_PANEL_ID);
  expect(history.location.pathname).toEqual(
    `${contestRoutes.view(ballotMeasure.id).path}/audio/${
      ElectionStringKey.CONTEST_TITLE
    }/${ballotMeasure.id}`
  );
});

test('contests from an external source cannot be added or reordered', async () => {
  mockScreenDependencies(undefined, undefined, {
    ...electionInfoFromElection(election),
    externalSource: 'ms-sems',
  });
  apiMock.listContests
    .expectRepeatedCallsWith({ electionId })
    .resolves(election.contests);

  renderScreen(contestRoutes.view(ballotMeasure.id).path);

  await screen.findByRole('heading', { name: 'Contest Info' });
  screen.getButton('Convert Results');
  expect(screen.queryButton('Add Contest')).not.toBeInTheDocument();
  expect(screen.queryButton('Reorder Contests')).not.toBeInTheDocument();
});
