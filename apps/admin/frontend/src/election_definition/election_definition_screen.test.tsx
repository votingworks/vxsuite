import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { DateWithoutTime, deferred, ok } from '@votingworks/basics';
import type { ElectionDefinitionPackage } from '@votingworks/admin-backend';
import type {
  ElectionInfo,
  StateFeaturesConfig,
} from '@votingworks/election-definition-backend';
import { BooleanEnvironmentVariableName } from '@votingworks/utils';
import { mockUsbDriveStatus } from '@votingworks/ui';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import {
  type BallotStyle,
  BallotType,
  type CandidateContest,
  type DippedSmartCardAuth,
  type District,
  type Party,
  type PollingPlace,
  type Precinct,
  constructElectionKey,
  HmpbBallotPaperSize,
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
import type { ElectionDefinitionApiClient } from '../api.js';
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
  isElectionDefinitionEnabled = true,
  usbDriveStatus?: UsbDriveStatus
) {
  const history = createMemoryHistory({ initialEntries: [path] });
  renderInAppContext(<AppRoutes />, {
    apiMock,
    auth: systemAdministratorAuth,
    history,
    electionDefinition: null,
    isElectionDefinitionEnabled,
    usbDriveStatus,
  });
  return history;
}

function getNavItems(): Array<string | null> {
  return within(screen.getByRole('navigation'))
    .getAllByRole('button')
    .map((button) => button.textContent);
}

function getActiveNavItems(): Array<string | null> {
  return within(screen.getByRole('navigation'))
    .getAllByRole('button')
    .filter((button) => button.querySelector('[data-icon="chevron-right"]'))
    .map((button) => button.textContent);
}

function expectCurrentInProgressElection(electionInfo: ElectionInfo | null) {
  apiMock.electionDefinitionApiClient.getCurrentInProgressElection
    .expectCallWith()
    .resolves(electionInfo);
}

function expectElectionInfoQueries(
  electionInfo: ElectionInfo,
  stateFeatures: StateFeaturesConfig = {},
  electionPackage: ElectionDefinitionPackage | null = null
) {
  apiMock.electionDefinitionApiClient.getElectionPackage
    .expectOptionalRepeatedCallsWith({ electionId })
    .resolves(electionPackage);
  apiMock.electionDefinitionApiClient.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(electionInfo);
  apiMock.electionDefinitionApiClient.getStateFeatures
    .expectCallWith({ electionId })
    .resolves(stateFeatures);
}

function expectNoElectionPackage() {
  apiMock.electionDefinitionApiClient.getElectionPackage
    .expectOptionalRepeatedCallsWith({ electionId })
    .resolves(null);
}

test('Create New Election creates an election and opens Election Info', async () => {
  apiMock.expectListPotentialElectionPackagesOnUsbDrive([]);
  apiMock.electionDefinitionApiClient.getCurrentInProgressElection
    .expectCallWith()
    .resolves(null);
  const history = renderScreen();

  apiMock.electionDefinitionApiClient.createInProgressElection
    .expectCallWith()
    .resolves(electionId);
  apiMock.electionDefinitionApiClient.getCurrentInProgressElection
    .expectCallWith()
    .resolves(blankElectionInfo);
  expectElectionInfoQueries(blankElectionInfo);
  await userEvent.click(await screen.findButton('Create New Election'));

  await screen.findByRole('tab', { name: 'Election Info', selected: true });
  expect(history.location.pathname).toEqual(
    routerPaths.electionDefinitionInfo(electionId)
  );
  expect(getNavItems()).toEqual([
    'Back',
    'Definition',
    'Proof Ballots',
    'Finalize',
  ]);
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
  apiMock.electionDefinitionApiClient.updateElectionInfo
    .expectCallWith(updatedElectionInfo)
    .resolves(ok());
  apiMock.electionDefinitionApiClient.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(updatedElectionInfo);
  expectCurrentInProgressElection(updatedElectionInfo);
  await userEvent.click(screen.getButton('Save'));
  await screen.findButton('Edit');
});

test('the Districts tab edits the election districts', async () => {
  const district: District = { id: 'district-1', name: 'District 1' };
  const renamedDistrict: District = { ...district, name: 'District A' };
  expectCurrentInProgressElection(generalElectionInfo);
  expectElectionInfoQueries(generalElectionInfo);
  const history = renderScreen(routerPaths.electionDefinitionInfo(electionId));
  await screen.findButton('Edit');

  apiMock.electionDefinitionApiClient.listDistricts
    .expectCallWith({ electionId })
    .resolves([district]);
  await userEvent.click(screen.getByRole('tab', { name: 'Districts' }));
  await screen.findByRole('tab', { name: 'Districts', selected: true });
  expect(history.location.pathname).toEqual(
    routerPaths.electionDefinitionDistricts(electionId)
  );

  await userEvent.click(await screen.findButton('Edit Districts'));
  expect(history.location.pathname).toEqual(
    `${routerPaths.electionDefinitionDistricts(electionId)}/edit`
  );
  screen.getByRole('tab', { name: 'Districts', selected: true });
  const input = screen.getByDisplayValue('District 1');
  await userEvent.clear(input);
  await userEvent.type(input, renamedDistrict.name);

  apiMock.electionDefinitionApiClient.updateDistricts
    .expectCallWith({
      electionId,
      deletedDistrictIds: [],
      newDistricts: [],
      updatedDistricts: [renamedDistrict],
    })
    .resolves(ok());
  expectCurrentInProgressElection(generalElectionInfo);
  apiMock.electionDefinitionApiClient.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(generalElectionInfo);
  apiMock.electionDefinitionApiClient.listDistricts
    .expectCallWith({ electionId })
    .resolves([renamedDistrict]);
  await userEvent.click(screen.getButton('Save'));

  await screen.findButton('Edit Districts');
  expect(history.location.pathname).toEqual(
    routerPaths.electionDefinitionDistricts(electionId)
  );
  screen.getByDisplayValue('District A');
});

test('the Precincts tab edits the election precincts', async () => {
  const district: District = { id: 'district-1', name: 'District 1' };
  const precinct: Precinct = {
    id: 'precinct-1',
    name: 'Precinct 1',
    districtIds: [district.id],
  };
  const renamedPrecinct: Precinct = { ...precinct, name: 'Precinct A' };
  expectCurrentInProgressElection(generalElectionInfo);
  expectElectionInfoQueries(generalElectionInfo);
  const history = renderScreen(routerPaths.electionDefinitionInfo(electionId));
  await screen.findButton('Edit');

  apiMock.electionDefinitionApiClient.listPrecincts
    .expectCallWith({ electionId })
    .resolves([precinct]);
  apiMock.electionDefinitionApiClient.listDistricts
    .expectCallWith({ electionId })
    .resolves([district]);
  apiMock.electionDefinitionApiClient.getRegisteredVoterCounts
    .expectCallWith({ electionId })
    .resolves({ [precinct.id]: 100 });
  await userEvent.click(screen.getByRole('tab', { name: 'Precincts' }));
  await screen.findByRole('heading', { name: 'Precinct Info' });
  screen.getByRole('tab', { name: 'Precincts', selected: true });
  const precinctPath = `${routerPaths.electionDefinitionPrecincts(
    electionId
  )}/${precinct.id}`;
  expect(history.location.pathname).toEqual(precinctPath);
  expect(screen.getByLabelText('Registered Voters')).toHaveValue(100);

  await userEvent.click(screen.getButton('Edit'));
  await screen.findByRole('heading', { name: 'Edit Precinct' });
  expect(history.location.pathname).toEqual(`${precinctPath}/edit`);
  screen.getByRole('tab', { name: 'Precincts', selected: true });
  const input = screen.getByLabelText('Name');
  await userEvent.clear(input);
  await userEvent.type(input, renamedPrecinct.name);

  apiMock.electionDefinitionApiClient.updatePrecinct
    .expectCallWith({
      electionId,
      updatedPrecinct: renamedPrecinct,
      registeredVoterCounts: 100,
    })
    .resolves(ok());
  expectCurrentInProgressElection(generalElectionInfo);
  apiMock.electionDefinitionApiClient.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(generalElectionInfo);
  apiMock.electionDefinitionApiClient.listDistricts
    .expectCallWith({ electionId })
    .resolves([district]);
  apiMock.electionDefinitionApiClient.listPrecincts
    .expectCallWith({ electionId })
    .resolves([renamedPrecinct]);
  apiMock.electionDefinitionApiClient.getRegisteredVoterCounts
    .expectCallWith({ electionId })
    .resolves({ [precinct.id]: 100 });
  await userEvent.click(screen.getButton('Save'));

  await screen.findByRole('heading', { name: 'Precinct Info' });
  expect(history.location.pathname).toEqual(precinctPath);
  await screen.findByDisplayValue('Precinct A');
});

test('the Polling Places tab edits the election polling places', async () => {
  const precinct: Precinct = {
    id: 'precinct-1',
    name: 'Precinct 1',
    districtIds: [],
  };
  const place: PollingPlace = {
    id: 'place-1',
    name: 'Town Hall',
    precincts: { [precinct.id]: { type: 'whole' } },
    type: 'election_day',
  };
  const renamedPlace: PollingPlace = { ...place, name: 'Library' };
  expectCurrentInProgressElection(generalElectionInfo);
  expectElectionInfoQueries(generalElectionInfo, {
    EDIT_POLLING_PLACES: true,
  });
  const history = renderScreen(routerPaths.electionDefinitionInfo(electionId));
  await screen.findButton('Edit');

  apiMock.electionDefinitionApiClient.listPollingPlaces
    .expectCallWith({ electionId })
    .resolves([place]);
  apiMock.electionDefinitionApiClient.listPrecincts
    .expectCallWith({ electionId })
    .resolves([precinct]);
  await userEvent.click(screen.getByRole('tab', { name: 'Polling Places' }));
  await screen.findByRole('heading', { name: 'Polling Place Info' });
  screen.getByRole('tab', { name: 'Polling Places', selected: true });
  const placePath = `${routerPaths.electionDefinitionPollingPlaces(
    electionId
  )}/${place.id}`;
  expect(history.location.pathname).toEqual(placePath);

  await userEvent.click(screen.getButton('Edit'));
  await screen.findByRole('heading', { name: 'Edit Polling Place' });
  expect(history.location.pathname).toEqual(`${placePath}/edit`);
  const input = screen.getByLabelText('Name');
  await userEvent.clear(input);
  await userEvent.type(input, renamedPlace.name);

  apiMock.electionDefinitionApiClient.setPollingPlace
    .expectCallWith({ electionId, place: renamedPlace })
    .resolves(ok());
  expectCurrentInProgressElection(generalElectionInfo);
  apiMock.electionDefinitionApiClient.listPollingPlaces
    .expectCallWith({ electionId })
    .resolves([renamedPlace]);
  apiMock.electionDefinitionApiClient.listPrecincts
    .expectCallWith({ electionId })
    .resolves([precinct]);
  await userEvent.click(screen.getButton('Save'));

  await screen.findByRole('heading', { name: 'Polling Place Info' });
  expect(history.location.pathname).toEqual(placePath);
  await screen.findByDisplayValue(renamedPlace.name);
});

test('there is no Polling Places tab without EDIT_POLLING_PLACES', async () => {
  expectCurrentInProgressElection(generalElectionInfo);
  expectElectionInfoQueries(generalElectionInfo);
  const history = renderScreen(
    routerPaths.electionDefinitionPollingPlaces(electionId)
  );

  await screen.findButton('Edit');
  expect(history.location.pathname).toEqual(
    routerPaths.electionDefinitionInfo(electionId)
  );
  screen.getByRole('tab', { name: 'Precincts' });
  expect(
    screen.queryByRole('tab', { name: 'Polling Places' })
  ).not.toBeInTheDocument();
});

test('the Parties tab edits the election parties', async () => {
  const party: Party = {
    id: 'party-1',
    name: 'Democrat',
    fullName: 'Democratic Party',
    abbrev: 'D',
  };
  const editedParty: Party = { ...party, abbrev: 'DEM' };
  expectCurrentInProgressElection(generalElectionInfo);
  expectElectionInfoQueries(generalElectionInfo);
  const history = renderScreen(routerPaths.electionDefinitionInfo(electionId));
  await screen.findButton('Edit');

  apiMock.electionDefinitionApiClient.listParties
    .expectCallWith({ electionId })
    .resolves([party]);
  await userEvent.click(screen.getByRole('tab', { name: 'Parties' }));
  await screen.findByRole('tab', { name: 'Parties', selected: true });
  expect(history.location.pathname).toEqual(
    routerPaths.electionDefinitionParties(electionId)
  );

  await userEvent.click(await screen.findButton('Edit Parties'));
  expect(history.location.pathname).toEqual(
    `${routerPaths.electionDefinitionParties(electionId)}/edit`
  );
  screen.getByRole('tab', { name: 'Parties', selected: true });
  const input = screen.getByDisplayValue(party.abbrev);
  await userEvent.clear(input);
  await userEvent.type(input, editedParty.abbrev);

  apiMock.electionDefinitionApiClient.updateParties
    .expectCallWith({
      electionId,
      deletedPartyIds: [],
      newParties: [],
      updatedParties: [editedParty],
    })
    .resolves(ok());
  expectCurrentInProgressElection(generalElectionInfo);
  apiMock.electionDefinitionApiClient.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(generalElectionInfo);
  apiMock.electionDefinitionApiClient.listParties
    .expectCallWith({ electionId })
    .resolves([editedParty]);
  await userEvent.click(screen.getButton('Save'));

  await screen.findButton('Edit Parties');
  expect(history.location.pathname).toEqual(
    routerPaths.electionDefinitionParties(electionId)
  );
  screen.getByDisplayValue(editedParty.abbrev);
});

test('the Contests tab edits the election contests', async () => {
  const district: District = { id: 'district-1', name: 'District 1' };
  const contest: CandidateContest = {
    id: 'contest-1',
    type: 'candidate',
    title: 'Mayor',
    districtId: district.id,
    seats: 1,
    allowWriteIns: true,
    candidates: [
      {
        id: 'candidate-1',
        firstName: 'Ada',
        lastName: 'Lovelace',
        name: 'Ada Lovelace',
      },
    ],
  };
  const editedContest: CandidateContest = { ...contest, title: 'Governor' };
  expectCurrentInProgressElection(generalElectionInfo);
  expectElectionInfoQueries(generalElectionInfo);
  const history = renderScreen(routerPaths.electionDefinitionInfo(electionId));
  await screen.findButton('Edit');

  apiMock.electionDefinitionApiClient.listContests
    .expectCallWith({ electionId })
    .resolves([contest]);
  apiMock.electionDefinitionApiClient.listDistricts
    .expectCallWith({ electionId })
    .resolves([district]);
  apiMock.electionDefinitionApiClient.listParties
    .expectCallWith({ electionId })
    .resolves([]);
  await userEvent.click(screen.getByRole('tab', { name: 'Contests' }));
  await screen.findByRole('heading', { name: 'Contest Info' });
  screen.getByRole('tab', { name: 'Contests', selected: true });
  expect(history.location.pathname).toEqual(
    `${routerPaths.electionDefinitionContests(electionId)}/${contest.id}`
  );

  await userEvent.click(screen.getButton('Edit'));
  await screen.findByRole('heading', { name: 'Edit Contest' });
  screen.getByRole('tab', { name: 'Contests', selected: true });
  const titleInput = screen.getByLabelText('Title');
  await userEvent.clear(titleInput);
  await userEvent.type(titleInput, editedContest.title);

  apiMock.electionDefinitionApiClient.updateContest
    .expectCallWith({
      electionId,
      updatedContest: {
        ...editedContest,
        candidates: [
          {
            ...contest.candidates[0]!,
            middleName: undefined,
            designation: undefined,
            partyIds: undefined,
          },
        ],
      },
    })
    .resolves(ok());
  expectCurrentInProgressElection(generalElectionInfo);
  apiMock.electionDefinitionApiClient.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(generalElectionInfo);
  apiMock.electionDefinitionApiClient.listContests
    .expectCallWith({ electionId })
    .resolves([editedContest]);
  apiMock.electionDefinitionApiClient.listDistricts
    .expectCallWith({ electionId })
    .resolves([district]);
  apiMock.electionDefinitionApiClient.listParties
    .expectCallWith({ electionId })
    .resolves([]);
  await userEvent.click(screen.getButton('Save'));

  await screen.findByRole('heading', { name: 'Contest Info' });
  expect(history.location.pathname).toEqual(
    `${routerPaths.electionDefinitionContests(electionId)}/${contest.id}`
  );
  expect(screen.getByLabelText('Title')).toHaveValue(editedContest.title);
  expect(screen.queryButton(/preview or edit audio/i)).not.toBeInTheDocument();
});

test('Proof Ballots lists ballot styles and edits the ballot layout in tabs', async () => {
  const precinct: Precinct = {
    id: 'precinct-1',
    name: 'Precinct 1',
    districtIds: ['district-1'],
  };
  const ballotStyle: BallotStyle = {
    id: '1_en',
    groupId: '1',
    precincts: [precinct.id],
    districts: ['district-1'],
    languages: [LanguageCode.ENGLISH],
  };
  expectCurrentInProgressElection(generalElectionInfo);
  expectElectionInfoQueries(generalElectionInfo);
  apiMock.electionDefinitionApiClient.listPrecincts
    .expectCallWith({ electionId })
    .resolves([precinct]);
  apiMock.electionDefinitionApiClient.listBallotStyles
    .expectCallWith({ electionId })
    .resolves([ballotStyle]);
  apiMock.electionDefinitionApiClient.listParties
    .expectCallWith({ electionId })
    .resolves([]);
  expectNoElectionPackage();
  const history = renderScreen(routerPaths.proofBallotsForElection(electionId));
  await screen.findByRole('heading', { name: 'Proof Ballots' });
  const table = await screen.findByRole('table');
  expect(history.location.pathname).toEqual(
    routerPaths.proofBallotsBallotStyles(electionId)
  );
  screen.getByRole('tab', { name: 'Ballot Styles', selected: true });
  expect(getNavItems()).toEqual([
    'Back',
    'Definition',
    'Proof Ballots',
    'Finalize',
  ]);
  expect(getActiveNavItems()).toEqual(['Proof Ballots']);
  within(table).getByRole('cell', { name: 'Precinct 1' });
  within(table).getByRole('cell', { name: '1_en' });
  within(table).getByRole('button', { name: 'View Ballot' });
  expect(
    screen.queryByRole('radiogroup', { name: 'Paper Size' })
  ).not.toBeInTheDocument();

  apiMock.electionDefinitionApiClient.getBallotLayoutSettings
    .expectCallWith({ electionId })
    .resolves({ paperSize: HmpbBallotPaperSize.Letter, compact: false });
  await userEvent.click(screen.getByRole('tab', { name: 'Ballot Layout' }));
  await screen.findByRole('radiogroup', { name: 'Paper Size' });
  screen.getByRole('tab', { name: 'Ballot Layout', selected: true });
  expect(getActiveNavItems()).toEqual(['Proof Ballots']);
  expect(history.location.pathname).toEqual(
    routerPaths.proofBallotsBallotLayout(electionId)
  );
  expect(screen.queryByRole('table')).not.toBeInTheDocument();

  await userEvent.click(screen.getButton('Edit'));
  await userEvent.click(screen.getByLabelText('8.5 x 14 inches (Legal)'));
  await userEvent.click(screen.getByLabelText('Compact'));
  apiMock.electionDefinitionApiClient.updateBallotLayoutSettings
    .expectCallWith({
      electionId,
      paperSize: HmpbBallotPaperSize.Legal,
      compact: true,
    })
    .resolves();
  apiMock.electionDefinitionApiClient.getBallotLayoutSettings
    .expectCallWith({ electionId })
    .resolves({ paperSize: HmpbBallotPaperSize.Legal, compact: true });
  await userEvent.click(screen.getButton('Save'));
  await screen.findButton('Edit');
  expect(screen.getByLabelText('8.5 x 14 inches (Legal)')).toBeChecked();
  expect(screen.getByLabelText('Compact')).toBeChecked();
});

test('View Ballot opens a ballot proof to save, print and close back to Ballot Styles', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const precinct: Precinct = {
    id: 'precinct-1',
    name: 'Precinct 1',
    districtIds: ['district-1'],
  };
  const ballotStyle: BallotStyle = {
    id: '1_en',
    groupId: '1',
    precincts: [precinct.id],
    districts: ['district-1'],
    languages: [LanguageCode.ENGLISH],
  };
  expectCurrentInProgressElection(generalElectionInfo);
  apiMock.electionDefinitionApiClient.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(generalElectionInfo);
  apiMock.electionDefinitionApiClient.listPrecincts
    .expectCallWith({ electionId })
    .resolves([precinct]);
  apiMock.electionDefinitionApiClient.listBallotStyles
    .expectCallWith({ electionId })
    .resolves([ballotStyle]);
  apiMock.electionDefinitionApiClient.listParties
    .expectCallWith({ electionId })
    .resolves([]);
  expectNoElectionPackage();
  const history = renderScreen(
    routerPaths.proofBallotsBallotStyles(electionId),
    true,
    mockUsbDriveStatus('mounted')
  );
  const table = await screen.findByRole('table');

  apiMock.electionDefinitionApiClient.getBallotLayoutSettings
    .expectCallWith({ electionId })
    .resolves({ paperSize: HmpbBallotPaperSize.Letter, compact: false });
  const preview =
    deferred<
      Awaited<ReturnType<ElectionDefinitionApiClient['getBallotPreviewPdf']>>
    >();
  apiMock.electionDefinitionApiClient.getBallotPreviewPdf
    .expectCallWith({
      electionId,
      ballotStyleId: ballotStyle.id,
      precinctId: precinct.id,
      ballotType: BallotType.Precinct,
      ballotMode: 'official',
      variant: undefined,
    })
    .returns(preview.promise);
  apiMock.setPrinterStatus({ connected: true });
  await userEvent.click(
    within(table).getByRole('button', { name: 'View Ballot' })
  );
  await screen.findByRole('heading', { name: 'View Ballot' });
  expect(screen.getButton('Save PDF')).toBeDisabled();
  expect(screen.getButton('Print')).toBeDisabled();
  preview.resolve(
    ok({
      pdfData: new TextEncoder().encode('mock ballot pdf'),
      fileName: 'PROOF-official-precinct-ballot-Precinct_1-1_en.pdf',
    })
  );
  await waitFor(() => expect(screen.getButton('Save PDF')).toBeEnabled());
  expect(history.location.pathname).toEqual(
    routerPaths.proofBallotsViewBallot(electionId, ballotStyle.id, precinct.id)
  );
  screen.getByText('Precinct 1');
  screen.getByText('8.5 x 11 inches (Letter)');
  expect(
    screen.queryByRole('radio', { name: 'Federal Office Only' })
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  expect(screen.queryButton('Download PDF')).not.toBeInTheDocument();

  const previewInput = {
    electionId,
    ballotStyleId: ballotStyle.id,
    precinctId: precinct.id,
    ballotType: BallotType.Precinct,
    ballotMode: 'official',
    variant: undefined,
  } as const;
  const fileName = 'PROOF-official-precinct-ballot-Precinct_1-1_en.pdf';
  apiMock.electionDefinitionApiClient.saveBallotPreviewPdf
    .expectCallWith({ ...previewInput, filename: fileName })
    .resolves(ok([`/media/usb-drive/${fileName}`]));
  await userEvent.click(await screen.findButton('Save PDF'));
  const saveModal = await screen.findByRole('alertdialog');
  within(saveModal).getByText(fileName);
  await userEvent.click(within(saveModal).getButton('Save'));
  await screen.findByText('Ballot Proof Saved');
  await userEvent.click(within(saveModal).getButton('Close'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  apiMock.electionDefinitionApiClient.printBallotPreviewPdf
    .expectCallWith(previewInput)
    .resolves();
  await userEvent.click(screen.getButton('Print'));
  await vi.runOnlyPendingTimersAsync();
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  expectNoElectionPackage();
  await userEvent.click(screen.getButton('Close'));
  await screen.findByRole('tab', { name: 'Ballot Styles', selected: true });
  expect(history.location.pathname).toEqual(
    routerPaths.proofBallotsBallotStyles(electionId)
  );
  vi.useRealTimers();
});

test('an election definition in progress is shown on the Election screen', async () => {
  apiMock.expectListPotentialElectionPackagesOnUsbDrive([]);
  apiMock.electionDefinitionApiClient.getCurrentInProgressElection
    .expectCallWith()
    .resolves(generalElectionInfo);
  apiMock.electionDefinitionApiClient.getElectionPackage
    .expectOptionalRepeatedCallsWith({ electionId })
    .resolves(null);
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
  apiMock.electionDefinitionApiClient.getCurrentInProgressElection
    .expectCallWith()
    .resolves(blankElectionInfo);
  apiMock.electionDefinitionApiClient.getElectionPackage
    .expectOptionalRepeatedCallsWith({ electionId })
    .resolves(null);
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
  apiMock.electionDefinitionApiClient.deleteElection
    .expectCallWith({ electionId })
    .resolves();
  apiMock.expectListPotentialElectionPackagesOnUsbDrive([]);
  apiMock.electionDefinitionApiClient.getCurrentInProgressElection
    .expectCallWith()
    .resolves(null);
  await userEvent.click(within(modal).getButton('Delete'));

  await screen.findButton('Create New Election');
  expect(history.location.pathname).toEqual(routerPaths.election);
});

test('the Definition nav item opens Election Info from Proof Ballots', async () => {
  expectCurrentInProgressElection(generalElectionInfo);
  apiMock.electionDefinitionApiClient.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(generalElectionInfo);
  apiMock.electionDefinitionApiClient.listPrecincts
    .expectCallWith({ electionId })
    .resolves([]);
  apiMock.electionDefinitionApiClient.listBallotStyles
    .expectCallWith({ electionId })
    .resolves([]);
  apiMock.electionDefinitionApiClient.listParties
    .expectCallWith({ electionId })
    .resolves([]);
  expectNoElectionPackage();
  apiMock.electionDefinitionApiClient.getStateFeatures
    .expectCallWith({ electionId })
    .resolves({});
  const history = renderScreen(routerPaths.proofBallotsForElection(electionId));
  await screen.findByRole('tab', { name: 'Ballot Styles', selected: true });
  expect(getActiveNavItems()).toEqual(['Proof Ballots']);

  await userEvent.click(
    within(screen.getByRole('navigation')).getButton('Definition')
  );
  await screen.findButton('Edit');
  expect(history.location.pathname).toEqual(
    routerPaths.electionDefinitionInfo(electionId)
  );
  expect(getActiveNavItems()).toEqual(['Definition']);
});

test('the Definition area redirects to the Election screen without an election definition', async () => {
  apiMock.electionDefinitionApiClient.getCurrentInProgressElection
    .expectCallWith()
    .resolves(null);
  apiMock.expectListPotentialElectionPackagesOnUsbDrive([]);
  const history = renderScreen(routerPaths.electionDefinitionInfo(electionId));

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

test('a definition URL for an old election opens the Election screen', async () => {
  expectCurrentInProgressElection(generalElectionInfo);
  apiMock.expectListPotentialElectionPackagesOnUsbDrive([]);
  apiMock.electionDefinitionApiClient.getElectionPackage
    .expectOptionalRepeatedCallsWith({ electionId })
    .resolves(null);
  const history = renderScreen(
    routerPaths.electionDefinitionInfo('old-election')
  );

  await screen.findByRole('link', { name: /General Election/ });
  expect(history.location.pathname).toEqual(routerPaths.election);
});

test('the Proof Ballots nav item opens ballot proofing for the current election', async () => {
  expectCurrentInProgressElection(generalElectionInfo);
  expectElectionInfoQueries(generalElectionInfo);
  const history = renderScreen(routerPaths.electionDefinitionInfo(electionId));
  await screen.findButton('Edit');

  apiMock.electionDefinitionApiClient.listPrecincts
    .expectCallWith({ electionId })
    .resolves([]);
  apiMock.electionDefinitionApiClient.listBallotStyles
    .expectCallWith({ electionId })
    .resolves([]);
  apiMock.electionDefinitionApiClient.listParties
    .expectCallWith({ electionId })
    .resolves([]);
  expectNoElectionPackage();
  await userEvent.click(
    within(screen.getByRole('navigation')).getButton('Proof Ballots')
  );
  await screen.findByRole('tab', { name: 'Ballot Styles', selected: true });
  expect(history.location.pathname).toEqual(
    routerPaths.proofBallotsBallotStyles(electionId)
  );
  await waitFor(() => apiMock.assertComplete());
});

test.each([
  routerPaths.electionDefinition,
  routerPaths.proofBallots,
  routerPaths.finalize,
])('%s without an election id opens the Election screen', async (path) => {
  apiMock.electionDefinitionApiClient.getCurrentInProgressElection
    .expectCallWith()
    .resolves(null);
  apiMock.expectListPotentialElectionPackagesOnUsbDrive([]);
  const history = renderScreen(path);

  await screen.findButton('Create New Election');
  expect(history.location.pathname).toEqual(routerPaths.election);
});

test('a Proof Ballots URL for an old election opens the Election screen', async () => {
  expectCurrentInProgressElection(generalElectionInfo);
  apiMock.expectListPotentialElectionPackagesOnUsbDrive([]);
  apiMock.electionDefinitionApiClient.getElectionPackage
    .expectOptionalRepeatedCallsWith({ electionId })
    .resolves(null);
  const history = renderScreen(
    routerPaths.proofBallotsForElection('old-election')
  );

  await screen.findByRole('link', { name: /General Election/ });
  expect(history.location.pathname).toEqual(routerPaths.election);
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

const finalizePrecinct: Precinct = {
  id: 'precinct-1',
  name: 'Precinct 1',
  districtIds: ['district-1'],
};

const finalizeBallotStyle: BallotStyle = {
  id: '1_en',
  groupId: '1',
  precincts: [finalizePrecinct.id],
  districts: ['district-1'],
  languages: [LanguageCode.ENGLISH],
};

const absenteePollingPlace: PollingPlace = {
  id: 'absentee-place',
  name: 'Town Hall',
  type: 'absentee',
  precincts: { [finalizePrecinct.id]: { type: 'whole' } },
};

const builtElectionPackage: ElectionDefinitionPackage = {
  status: 'succeeded',
  ballotHash: 'ballot-hash',
  electionPackagePath: 'election-1/election-package.zip',
  officialBallotsPath: 'election-1/official-ballots.zip',
  testBallotsPath: 'election-1/test-ballots.zip',
};

function expectElectionPackage(
  electionPackage: ElectionDefinitionPackage | null
) {
  apiMock.electionDefinitionApiClient.getElectionPackage
    .expectCallWith({ electionId })
    .resolves(electionPackage);
}

function expectFinalizeQueries({
  electionInfo = generalElectionInfo,
  ballotStyles = [finalizeBallotStyle],
  precincts = [finalizePrecinct],
  registeredVoterCounts = {},
  pollingPlaces = [absenteePollingPlace],
}: {
  electionInfo?: ElectionInfo;
  ballotStyles?: BallotStyle[];
  precincts?: Precinct[];
  registeredVoterCounts?: Record<string, number>;
  pollingPlaces?: PollingPlace[];
} = {}) {
  apiMock.electionDefinitionApiClient.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(electionInfo);
  apiMock.electionDefinitionApiClient.getStateFeatures
    .expectCallWith({ electionId })
    .resolves({ EDIT_POLLING_PLACES: true });
  apiMock.electionDefinitionApiClient.listBallotStyles
    .expectCallWith({ electionId })
    .resolves(ballotStyles);
  apiMock.electionDefinitionApiClient.listPrecincts
    .expectCallWith({ electionId })
    .resolves(precincts);
  apiMock.electionDefinitionApiClient.getRegisteredVoterCounts
    .expectCallWith({ electionId })
    .resolves(registeredVoterCounts);
  apiMock.electionDefinitionApiClient.listPollingPlaces
    .expectCallWith({ electionId })
    .resolves(pollingPlaces);
}

test('Finalize Election renders every ballot with progress, then offers the official and test ballots to save', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  expectCurrentInProgressElection(generalElectionInfo);
  expectElectionPackage(null);
  expectFinalizeQueries();
  renderScreen(
    routerPaths.finalizeForElection(electionId),
    true,
    mockUsbDriveStatus('mounted')
  );
  await screen.findByText('Election Not Finalized');
  screen.getByRole('heading', { name: 'Finalize' });
  expect(getNavItems()).toEqual([
    'Back',
    'Definition',
    'Proof Ballots',
    'Finalize',
  ]);
  expect(getActiveNavItems()).toEqual(['Finalize']);
  screen.getByText('Proof each ballot style, then finalize the election.');

  await userEvent.click(screen.getButton('Finalize Election'));
  let modal = await screen.findByRole('alertdialog');
  await userEvent.click(within(modal).getButton('Cancel'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  await userEvent.click(screen.getButton('Finalize Election'));
  modal = await screen.findByRole('alertdialog');
  within(modal).getByText(/VxAdmin will be configured for it/);
  apiMock.electionDefinitionApiClient.finalizeElection
    .expectCallWith({ electionId })
    .resolves();
  expectElectionPackage({ status: 'running' });
  await userEvent.click(within(modal).getButton('Finalize Election'));
  await screen.findByText('Finalizing Election');
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  screen.getByText('Preparing to render ballots');

  expectElectionPackage({
    status: 'running',
    progress: { label: 'Rendering test ballots', progress: 1, total: 2 },
  });
  await vi.advanceTimersByTimeAsync(1000);
  await screen.findByText('Rendering test ballots');
  screen.getByRole('progressbar');

  expectElectionPackage(builtElectionPackage);
  await vi.advanceTimersByTimeAsync(1000);
  await screen.findByText('Election Finalized');
  screen.getByText(
    'The election can no longer be edited. Save ballots to a USB drive for printing.'
  );
  screen.getByText(
    'Official precinct and absentee ballots, ready for printing.'
  );
  screen.getByText(
    'Unofficial ballots for use with VotingWorks machines in Test Mode.'
  );

  for (const [title, ballotMode] of [
    ['Official Ballots', 'official'],
    ['Test Ballots', 'test'],
  ] as const) {
    await userEvent.click(screen.getButton(`Save ${title}`));
    const saveModal = await screen.findByRole('alertdialog');
    within(saveModal).getByText(`${ballotMode}-ballots.zip`);
    apiMock.electionDefinitionApiClient.saveElectionPackageBallots
      .expectCallWith({
        electionId,
        ballotMode,
        filename: `${ballotMode}-ballots.zip`,
      })
      .resolves(ok([`/media/usb-drive/${ballotMode}-ballots.zip`]));
    await userEvent.click(within(saveModal).getButton('Save'));
    await screen.findByText(`${title} Saved`);
    await userEvent.click(within(saveModal).getButton('Close'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  }
  vi.useRealTimers();
});

test('a failed build shows its error and the election can be finalized again', async () => {
  expectCurrentInProgressElection(generalElectionInfo);
  expectElectionPackage({ status: 'failed', error: 'Contest is too long' });
  expectFinalizeQueries();
  renderScreen(routerPaths.finalizeForElection(electionId));
  await screen.findByText('Finalizing Failed');
  screen.getByText('Contest is too long');
  await screen.findButton('Finalize Election');
});

test('a build without progress totals shows an empty progress bar', async () => {
  expectCurrentInProgressElection(generalElectionInfo);
  expectElectionPackage({
    status: 'running',
    progress: { label: 'Laying out ballots', progress: 0, total: 0 },
  });
  renderScreen(routerPaths.finalizeForElection(electionId));
  await screen.findByText('Laying out ballots');
});

test('a finalized election without test ballots offers only official ballots', async () => {
  expectCurrentInProgressElection(generalElectionInfo);
  expectElectionPackage({
    ...builtElectionPackage,
    testBallotsPath: undefined,
  });
  renderScreen(routerPaths.finalizeForElection(electionId));
  await screen.findButton('Save Official Ballots');
  expect(screen.queryButton('Save Test Ballots')).not.toBeInTheDocument();
});

test.each<{
  description: string;
  queries: Parameters<typeof expectFinalizeQueries>[0];
  title: string;
}>([
  {
    description: 'incomplete election info',
    queries: { electionInfo: blankElectionInfo },
    title: 'Election Incomplete',
  },
  {
    description: 'no ballot styles',
    queries: { ballotStyles: [] },
    title: 'Ballots Incomplete',
  },
  {
    description: 'partial registered voter counts',
    queries: {
      precincts: [
        finalizePrecinct,
        { ...finalizePrecinct, id: 'precinct-2', name: 'Precinct 2' },
      ],
      registeredVoterCounts: { [finalizePrecinct.id]: 100 },
    },
    title:
      'Registered voter counts must be provided for all precincts and splits, or none.',
  },
  {
    description: 'precincts without an absentee polling place',
    queries: { pollingPlaces: [] },
    title: 'Absentee polling places must cover every precinct.',
  },
])(
  'the election cannot be finalized with $description',
  async ({ queries, title }) => {
    expectCurrentInProgressElection(generalElectionInfo);
    expectElectionPackage(null);
    expectFinalizeQueries(queries);
    renderScreen(routerPaths.finalizeForElection(electionId));
    await screen.findByText(title);
    expect(screen.queryButton('Finalize Election')).not.toBeInTheDocument();
  }
);

test('a Finalize URL for an old election opens the Election screen', async () => {
  expectCurrentInProgressElection(generalElectionInfo);
  apiMock.expectListPotentialElectionPackagesOnUsbDrive([]);
  const history = renderScreen(routerPaths.finalizeForElection('old-election'));
  await screen.findByRole('link', { name: /General Election/ });
  expect(history.location.pathname).toEqual(routerPaths.election);
});

test('a finalized election definition cannot be edited', async () => {
  expectCurrentInProgressElection(generalElectionInfo);
  expectElectionInfoQueries(generalElectionInfo, {}, builtElectionPackage);
  renderScreen(routerPaths.electionDefinitionInfo(electionId));
  expect(await screen.findButton('Edit')).toBeDisabled();
});

test('a failed build leaves the election definition editable', async () => {
  expectCurrentInProgressElection(generalElectionInfo);
  expectElectionInfoQueries(
    generalElectionInfo,
    {},
    { status: 'failed', error: 'Contest is too long' }
  );
  renderScreen(routerPaths.electionDefinitionInfo(electionId));
  expect(await screen.findButton('Edit')).toBeEnabled();
});

test('the ballot layout is locked once the election is finalized', async () => {
  expectCurrentInProgressElection(generalElectionInfo);
  expectElectionPackage(builtElectionPackage);
  apiMock.electionDefinitionApiClient.getStateFeatures
    .expectCallWith({ electionId })
    .resolves({});
  apiMock.electionDefinitionApiClient.getBallotLayoutSettings
    .expectCallWith({ electionId })
    .resolves({ paperSize: HmpbBallotPaperSize.Letter, compact: false });
  renderScreen(routerPaths.proofBallotsBallotLayout(electionId));
  expect(await screen.findButton('Edit')).toBeDisabled();
});
