import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { DateWithoutTime, ok } from '@votingworks/basics';
import type { ElectionInfo } from '@votingworks/election-definition-backend';
import { BooleanEnvironmentVariableName } from '@votingworks/utils';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import {
  type DippedSmartCardAuth,
  constructElectionKey,
  LanguageCode,
} from '@votingworks/types';
import { screen, waitFor, within } from '../../test/react_testing_library.js';
import {
  eitherNeitherElectionDefinition,
  renderInAppContext,
} from '../../test/render_in_app_context.js';
import {
  type ApiMock,
  createApiMock,
} from '../../test/helpers/mock_api_client.js';
import { AppRoutes } from '../components/app_routes.js';
import { routerPaths } from '../router_paths.js';

const featureFlagMock = vi.hoisted(() => {
  // eslint-disable-next-line global-require
  const { getFeatureFlagMock } = require('@votingworks/utils');
  return getFeatureFlagMock();
});
vi.mock('@votingworks/utils', async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

const systemAdministratorAuth: DippedSmartCardAuth.SystemAdministratorLoggedIn =
  {
    status: 'logged_in',
    user: mockSystemAdministratorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
    programmableCard: { status: 'no_card' },
  };

const electionManagerAuth: DippedSmartCardAuth.ElectionManagerLoggedIn = {
  status: 'logged_in',
  user: mockElectionManagerUser({
    electionKey: constructElectionKey(eitherNeitherElectionDefinition.election),
  }),
  sessionExpiresAt: mockSessionExpiresAt(),
};

const electionId = 'election-1';

const blankElectionInfo: ElectionInfo = {
  electionId,
  type: 'general',
  date: new DateWithoutTime('2026-11-05'),
  title: '',
  state: 'DEMO',
  jurisdictionName: '',
  seal: '',
  languageCodes: [LanguageCode.ENGLISH],
};

const generalElectionInfo: ElectionInfo = {
  ...blankElectionInfo,
  title: 'General Election',
  jurisdictionName: 'Demo County',
  seal: '<svg>seal</svg>',
};

let apiMock: ApiMock;

beforeEach(() => {
  featureFlagMock.resetFeatureFlags();
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.ENABLE_ADMIN_ELECTION_DESIGN
  );
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderScreen(
  path: string = routerPaths.election,
  isElectionDefinitionEnabled = true
) {
  const history = createMemoryHistory({ initialEntries: [path] });
  renderInAppContext(<AppRoutes />, {
    apiMock,
    auth: systemAdministratorAuth,
    history,
    electionDefinition: null,
    isElectionDefinitionEnabled,
  });
  return history;
}

function getNavItems(): Array<string | null> {
  return within(screen.getByRole('navigation'))
    .getAllByRole('button')
    .map((button) => button.textContent);
}

function expectCurrentInProgressElection(electionInfo: ElectionInfo | null) {
  apiMock.apiClient.getCurrentInProgressElection
    .expectCallWith()
    .resolves(electionInfo);
}

function expectElectionInfoQueries(electionInfo: ElectionInfo) {
  apiMock.apiClient.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(electionInfo);
  apiMock.apiClient.getStateFeatures
    .expectCallWith({ electionId })
    .resolves({});
}

test('Create New Election creates an election and opens Election Info', async () => {
  apiMock.expectListPotentialElectionPackagesOnUsbDrive([]);
  apiMock.apiClient.getCurrentInProgressElection
    .expectCallWith()
    .resolves(null);
  const history = renderScreen();

  apiMock.apiClient.createInProgressElection
    .expectCallWith()
    .resolves(electionId);
  apiMock.apiClient.getCurrentInProgressElection
    .expectCallWith()
    .resolves(blankElectionInfo);
  expectElectionInfoQueries(blankElectionInfo);
  await userEvent.click(await screen.findButton('Create New Election'));

  await screen.findByRole('tab', { name: 'Election Info', selected: true });
  expect(history.location.pathname).toEqual(
    routerPaths.electionDefinitionInfo(electionId)
  );
  expect(getNavItems()).toEqual(['Back', 'Definition']);
  expect(await screen.findByLabelText('Title')).toBeEnabled();
  expect(screen.queryByText('Ballot Languages')).not.toBeInTheDocument();
  expect(screen.queryByText('Signature')).not.toBeInTheDocument();
  screen.getButton('Delete Election');

  await userEvent.type(screen.getByLabelText('Title'), 'Election');
  await userEvent.type(screen.getByLabelText('Jurisdiction'), 'Demo County');
  await userEvent.upload(
    screen.getByLabelText('Upload Seal Image'),
    new File(['<svg>seal</svg>'], 'seal.svg', { type: 'image/svg+xml' })
  );
  await screen.findByAltText('Upload preview');
  const updatedElectionInfo: ElectionInfo = {
    ...blankElectionInfo,
    title: 'Election',
    jurisdictionName: 'Demo County',
    seal: '<svg>seal</svg>',
  };
  apiMock.apiClient.updateElectionInfo
    .expectCallWith(updatedElectionInfo)
    .resolves(ok());
  apiMock.apiClient.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(updatedElectionInfo);
  expectCurrentInProgressElection(updatedElectionInfo);
  await userEvent.click(screen.getButton('Save'));
  await screen.findButton('Edit');
});

test('an election definition in progress is shown on the Election screen', async () => {
  apiMock.expectListPotentialElectionPackagesOnUsbDrive([]);
  apiMock.apiClient.getCurrentInProgressElection
    .expectCallWith()
    .resolves(generalElectionInfo);
  const history = renderScreen();

  const card = await screen.findByRole('link', { name: /General Election/ });
  within(card).getByText(/Demo County, DEMO/);
  within(card).getByText('Edit');
  expect(screen.queryButton('Create New Election')).not.toBeInTheDocument();

  expectElectionInfoQueries(generalElectionInfo);
  await userEvent.click(card);
  await screen.findButton('Edit');
  expect(history.location.pathname).toEqual(
    routerPaths.electionDefinitionInfo(electionId)
  );
});

test('an untitled election definition is shown as Untitled Election', async () => {
  apiMock.expectListPotentialElectionPackagesOnUsbDrive([]);
  apiMock.apiClient.getCurrentInProgressElection
    .expectCallWith()
    .resolves(blankElectionInfo);
  renderScreen();

  const card = await screen.findByRole('link', { name: /Untitled Election/ });
  within(card).getByText(/^DEMO/);
});

test('Delete Election discards the election definition', async () => {
  expectCurrentInProgressElection(generalElectionInfo);
  expectElectionInfoQueries(generalElectionInfo);
  const history = renderScreen(routerPaths.electionDefinitionInfo(electionId));

  await userEvent.click(await screen.findButton('Delete Election'));
  let modal = await screen.findByRole('alertdialog');
  await userEvent.click(within(modal).getButton('Cancel'));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );

  await userEvent.click(screen.getButton('Delete Election'));
  modal = await screen.findByRole('alertdialog');
  within(modal).getByText(
    'Are you sure you want to delete this election? This action cannot be undone.'
  );
  apiMock.apiClient.discardInProgressElection.expectCallWith().resolves();
  apiMock.expectListPotentialElectionPackagesOnUsbDrive([]);
  apiMock.apiClient.getCurrentInProgressElection
    .expectCallWith()
    .resolves(null);
  await userEvent.click(within(modal).getButton('Delete'));

  await screen.findButton('Create New Election');
  expect(history.location.pathname).toEqual(routerPaths.election);
});

test('the Definition nav item opens the current election definition', async () => {
  apiMock.apiClient.getCurrentInProgressElection
    .expectCallWith()
    .resolves(generalElectionInfo);
  expectElectionInfoQueries(generalElectionInfo);
  const history = renderScreen(routerPaths.electionDefinition);

  await screen.findButton('Edit');
  expect(history.location.pathname).toEqual(
    routerPaths.electionDefinitionInfo(electionId)
  );
});

test('the Definition area redirects to the Election screen without an election definition', async () => {
  apiMock.apiClient.getCurrentInProgressElection
    .expectCallWith()
    .resolves(null);
  apiMock.expectListPotentialElectionPackagesOnUsbDrive([]);
  const history = renderScreen(routerPaths.electionDefinition);

  await screen.findButton('Create New Election');
  expect(history.location.pathname).toEqual(routerPaths.election);
});

test('unknown Definition paths open Election Info', async () => {
  expectCurrentInProgressElection(generalElectionInfo);
  expectElectionInfoQueries(generalElectionInfo);
  const history = renderScreen(
    `${routerPaths.electionDefinition}/${electionId}`
  );

  await screen.findButton('Edit');
  expect(history.location.pathname).toEqual(
    routerPaths.electionDefinitionInfo(electionId)
  );
});

test('back returns to the Election screen', async () => {
  expectCurrentInProgressElection(generalElectionInfo);
  expectElectionInfoQueries(generalElectionInfo);
  const history = renderScreen(routerPaths.electionDefinitionInfo(electionId));

  await screen.findButton('Edit');
  apiMock.expectListPotentialElectionPackagesOnUsbDrive([]);
  await userEvent.click(
    within(screen.getByRole('navigation')).getButton('Back')
  );
  expect(history.location.pathname).toEqual(routerPaths.election);
  await screen.findByRole('link', { name: /General Election/ });
});

test('a definition URL for an old election opens the current one', async () => {
  expectCurrentInProgressElection(generalElectionInfo);
  expectElectionInfoQueries(generalElectionInfo);
  const history = renderScreen(
    routerPaths.electionDefinitionInfo('old-election')
  );

  await screen.findButton('Edit');
  expect(history.location.pathname).toEqual(
    routerPaths.electionDefinitionInfo(electionId)
  );
});

test('there is no Definition area when election definition is disabled', async () => {
  apiMock.expectListPotentialElectionPackagesOnUsbDrive([]);
  const history = renderScreen(
    routerPaths.electionDefinitionInfo(electionId),
    false
  );

  await screen.findButton('Select Other File...');
  expect(history.location.pathname).toEqual(routerPaths.election);
  expect(screen.queryButton('Create New Election')).not.toBeInTheDocument();
});

test('election manager has no Definition area when the flag is on', async () => {
  const history = createMemoryHistory({
    initialEntries: [routerPaths.electionDefinition],
  });
  renderInAppContext(<AppRoutes />, {
    apiMock,
    auth: electionManagerAuth,
    history,
  });

  await screen.findByRole('heading', { name: 'Election' });
  await waitFor(() =>
    expect(history.location.pathname).toEqual(routerPaths.election)
  );
});
