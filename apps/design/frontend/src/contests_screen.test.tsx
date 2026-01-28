import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryHistory, MemoryHistory } from 'history';
import userEvent from '@testing-library/user-event';
import {
  AnyContest,
  BallotStyleGroupIdSchema,
  BallotStyleIdSchema,
  CandidateContest,
  Contest,
  Contests,
  DEFAULT_SYSTEM_SETTINGS,
  DistrictIdSchema,
  Election,
  ElectionId,
  ElectionStringKey,
  HmpbBallotPaperSize,
  PartyIdSchema,
  PrecinctIdSchema,
  unsafeParse,
  YesNoContest,
} from '@votingworks/types';
import {
  assert,
  assertDefined,
  DateWithoutTime,
  err,
  find,
  ok,
} from '@votingworks/basics';
import { StateFeaturesConfig } from '@votingworks/design-backend';
import {
  MockApiClient,
  createMockApiClient,
  mockUserFeatures,
  jurisdiction,
  provideApi,
  user,
  mockStateFeatures,
} from '../test/api_helpers';
import {
  electionInfoFromElection,
  generalElectionRecord,
  makeElectionRecord,
} from '../test/fixtures';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/react_testing_library';
import { withRoute } from '../test/routing_helpers';
import { ContestsScreen } from './contests_screen';
import { routes } from './routes';
import { makeIdFactory } from '../test/id_helpers';
import { ContestList, ContestListProps, ReorderParams } from './contest_list';
import { ContestAudioPanel } from './contest_audio_panel';

vi.mock('./contest_list.js');
const MockContestList = vi.mocked(ContestList);
const MOCK_CONTEST_LIST_ID = 'MockContestList';

vi.mock('./contest_audio_panel.js');
const MockContestAudioPanel = vi.mocked(ContestAudioPanel);
const MOCK_AUDIO_PANEL_ID = 'MockContestAudioPanel';

let apiMock: MockApiClient;

const idFactory = makeIdFactory();

beforeEach(() => {
  apiMock = createMockApiClient();
  idFactory.reset();
  apiMock.getUser.expectCallWith().resolves(user);
  mockUserFeatures(apiMock);

  MockContestList.mockReturnValue(<div data-testid={MOCK_CONTEST_LIST_ID} />);

  MockContestAudioPanel.mockReturnValue(
    <div data-testid={MOCK_AUDIO_PANEL_ID} />
  );
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderScreen(electionId: ElectionId, features?: StateFeaturesConfig) {
  const { path } = routes.election(electionId).contests.root;
  const history = createMemoryHistory({ initialEntries: [path] });
  mockStateFeatures(apiMock, electionId, features);
  render(
    provideApi(
      apiMock,
      withRoute(<ContestsScreen />, {
        paramPath: routes.election(':electionId').contests.root.path,
        path,
        history,
      })
    )
  );
  return history;
}

const electionWithNoContestsRecord = makeElectionRecord(
  {
    id: generalElectionRecord(jurisdiction.id).election.id,
    title: 'Test General Election',
    type: 'general',
    date: DateWithoutTime.today(),
    state: 'CA',
    county: { id: 'test-county', name: 'Test County' },
    districts: [
      {
        id: unsafeParse(DistrictIdSchema, 'test-district-1'),
        name: 'Test District 1',
      },
      {
        id: unsafeParse(DistrictIdSchema, 'test-district-2'),
        name: 'Test District 2',
      },
    ],
    precincts: [
      {
        id: 'test-precinct-1',
        name: 'Test Precinct 1',
        districtIds: [unsafeParse(DistrictIdSchema, 'test-district-1')],
      },
      {
        id: 'test-precinct-2',
        name: 'Test Precinct 2',
        districtIds: [],
      },
    ],
    ballotStyles: [
      {
        id: unsafeParse(BallotStyleIdSchema, 'test-ballot-style-1'),
        groupId: unsafeParse(BallotStyleGroupIdSchema, 'test-ballot-group-1'),
        districts: [unsafeParse(DistrictIdSchema, 'test-district-1')],
        precincts: [unsafeParse(PrecinctIdSchema, 'test-precinct-1')],
        partyId: unsafeParse(PartyIdSchema, 'test-party-1'),
      },
      {
        id: unsafeParse(BallotStyleIdSchema, 'test-ballot-style-2'),
        groupId: unsafeParse(BallotStyleGroupIdSchema, 'test-ballot-group-2'),
        districts: [unsafeParse(DistrictIdSchema, 'test-district-1')],
        precincts: [unsafeParse(PrecinctIdSchema, 'test-precinct-1')],
        partyId: unsafeParse(PartyIdSchema, 'test-party-2'),
      },
    ],
    contests: [],
    ballotLayout: {
      metadataEncoding: 'qr-code',
      paperSize: HmpbBallotPaperSize.Letter,
    },
    ballotStrings: {},
    parties: [
      {
        id: unsafeParse(PartyIdSchema, 'test-party-1'),
        name: 'Test Party 1',
        fullName: 'Test Party 1',
        abbrev: 'TP1',
      },
      {
        id: unsafeParse(PartyIdSchema, 'test-party-2'),
        name: 'Test Party 2',
        fullName: 'Test Party 2',
        abbrev: 'TP2',
      },
    ],
    seal: '',
  },
  jurisdiction.id
);

// Since we coarsely invalidate all election data on contest changes, there
// are a number of other API calls that refetch when we mutate contests
function expectOtherElectionApiCalls(election: Election) {
  const electionId = election.id;
  apiMock.getElectionInfo
    .expectCallWith({ electionId })
    .resolves(electionInfoFromElection(election));
  apiMock.getSystemSettings
    .expectOptionalRepeatedCallsWith({ electionId })
    .resolves(DEFAULT_SYSTEM_SETTINGS);
  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves(election.districts);
  apiMock.listParties.expectCallWith({ electionId }).resolves(election.parties);
}

test('auto-selects first available contest, if any', async () => {
  const { election } = generalElectionRecord(jurisdiction.id);
  const { contests } = election;
  const electionId = election.id;

  apiMock.listContests.expectCallWith({ electionId }).resolves(contests);
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  expectOtherElectionApiCalls(election);

  const history = renderScreen(electionId);
  await expectViewModeContest(history, electionId, contests[0]);
});

test('renders contest list on all sub-views', async () => {
  const { election } = generalElectionRecord(jurisdiction.id);
  const { contests } = election;
  const electionId = election.id;

  apiMock.listContests.expectCallWith({ electionId }).resolves(contests);
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  expectOtherElectionApiCalls(election);

  const history = renderScreen(electionId);

  await expectViewModeContest(history, electionId, contests[0]);
  expectContestListItems(contests);

  userEvent.click(screen.getButton('Add Contest'));
  await screen.findByRole('heading', { name: 'Add Contest' });
  expectContestListItems(contests);

  await navigateToContestEdit(history, electionId, election.contests[2].id);
  expectContestListItems(contests);

  // [TODO] Add assertion for audio editor view.
});

test('adding a candidate contest (general election)', async () => {
  const { election } = electionWithNoContestsRecord;
  const electionId = election.id;
  const newContest: CandidateContest = {
    id: idFactory.next(),
    type: 'candidate',
    title: 'New Contest',
    districtId: election.districts[0].id,
    seats: 2,
    termDescription: '2 years',
    allowWriteIns: false,
    candidates: [
      {
        id: idFactory.next(),
        name: 'New Candidate 1',
        firstName: 'New Candidate',
        middleName: undefined,
        lastName: '1',
        partyIds: [election.parties[0].id],
      },
      {
        id: idFactory.next(),
        name: 'New Candidate 2',
        firstName: 'New Candidate',
        middleName: undefined,
        lastName: '2',
        partyIds: [election.parties[1].id],
      },
      {
        id: idFactory.next(),
        name: 'New Candidate 3',
        firstName: 'New Candidate',
        middleName: undefined,
        lastName: '3',
      },
    ],
  };

  apiMock.listContests.expectCallWith({ electionId }).resolves([]);
  expectOtherElectionApiCalls(election);
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);

  const history = renderScreen(electionId);

  await screen.findByRole('heading', { name: 'Contests' });
  screen.getByText("You haven't added any contests to this election yet.");

  // Add contest
  userEvent.click(screen.getByRole('button', { name: 'Add Contest' }));
  await screen.findByRole('heading', { name: 'Add Contest' });

  // Set title
  userEvent.type(screen.getByLabelText('Title'), newContest.title);

  // Set district
  userEvent.click(screen.getByLabelText('District'));
  userEvent.click(screen.getByText(election.districts[0].name));

  // Default type is candidate contest
  within(screen.getByLabelText('Type')).getByRole('option', {
    name: 'Candidate Contest',
    selected: true,
  });

  // Set seats
  const seatsInput = screen.getByLabelText('Seats');
  expect(seatsInput).toHaveValue(1);
  userEvent.clear(seatsInput);
  userEvent.type(seatsInput, '2');

  // Set term
  userEvent.type(screen.getByLabelText('Term'), newContest.termDescription!);

  // Set write-ins allowed
  const writeInsControl = screen.getByLabelText('Write-Ins Allowed?');
  within(writeInsControl).getByRole('option', {
    name: 'Yes',
    selected: true,
  });
  userEvent.click(within(writeInsControl).getByRole('option', { name: 'No' }));

  // Add candidates
  screen.getByText("You haven't added any candidates to this contest yet.");
  for (const [i, candidate] of newContest.candidates.entries()) {
    userEvent.click(screen.getByRole('button', { name: 'Add Candidate' }));
    screen.getByRole('columnheader', { name: 'First Name' });
    screen.getByRole('columnheader', { name: 'Last Name' });
    screen.getByRole('columnheader', { name: 'Party' });
    const row = screen.getAllByRole('row')[i + 1];

    // Set name
    userEvent.type(
      within(row).getByLabelText(`Candidate ${i + 1} First Name`),
      'New Candidate'
    );
    userEvent.type(
      within(row).getByLabelText(`Candidate ${i + 1} Last Name`),
      `${i + 1}`
    );

    // Set party
    const partySelect = within(row).getByLabelText(`Candidate ${i + 1} Party`);
    expect(partySelect).toHaveValue('');
    userEvent.click(partySelect);
    const party = election.parties.find(
      (p) => p.id === candidate.partyIds?.[0]
    );
    if (party) {
      userEvent.click(within(row).getByText(party.name));
    }
  }

  // Save contest
  apiMock.createContest
    .expectCallWith({ electionId, newContest })
    .resolves(ok());
  apiMock.listContests
    .expectRepeatedCallsWith({ electionId })
    .resolves([newContest]);
  expectOtherElectionApiCalls(election);
  const saveButton = screen.getByRole('button', { name: 'Save' });
  userEvent.click(saveButton);

  await expectViewModeContest(history, electionId, newContest);
  expectContestListItems([newContest]);
});

test('editing a candidate contest (primary election)', async () => {
  const electionRecord = makeElectionRecord(
    {
      id: electionWithNoContestsRecord.election.id,
      title: 'Test Primary Election',
      type: 'primary',
      date: DateWithoutTime.today(),
      state: 'CA',
      county: { id: 'test-county', name: 'Test County' },
      districts: [
        {
          id: unsafeParse(DistrictIdSchema, 'test-district-1'),
          name: 'Test District 1',
        },
        {
          id: unsafeParse(DistrictIdSchema, 'test-district-2'),
          name: 'Test District 2',
        },
      ],
      precincts: [
        {
          id: 'test-precinct-1',
          name: 'Test Precinct 1',
          districtIds: [unsafeParse(DistrictIdSchema, 'test-district-1')],
        },
        {
          id: 'test-precinct-2',
          name: 'Test Precinct 2',
          districtIds: [],
        },
      ],
      ballotStyles: [
        {
          id: unsafeParse(BallotStyleIdSchema, 'test-ballot-style-1'),
          groupId: unsafeParse(BallotStyleGroupIdSchema, 'test-ballot-group-1'),
          districts: [unsafeParse(DistrictIdSchema, 'test-district-1')],
          precincts: [unsafeParse(PrecinctIdSchema, 'test-precinct-1')],
          partyId: unsafeParse(PartyIdSchema, 'test-party-1'),
        },
        {
          id: unsafeParse(BallotStyleIdSchema, 'test-ballot-style-2'),
          groupId: unsafeParse(BallotStyleGroupIdSchema, 'test-ballot-group-2'),
          districts: [unsafeParse(DistrictIdSchema, 'test-district-1')],
          precincts: [unsafeParse(PrecinctIdSchema, 'test-precinct-1')],
          partyId: unsafeParse(PartyIdSchema, 'test-party-2'),
        },
      ],
      parties: [
        {
          id: unsafeParse(PartyIdSchema, 'test-party-1'),
          name: 'Test Party 1',
          fullName: 'Test Party 1',
          abbrev: 'TP1',
        },
        {
          id: unsafeParse(PartyIdSchema, 'test-party-2'),
          name: 'Test Party 2',
          fullName: 'Test Party 2',
          abbrev: 'TP2',
        },
      ],
      contests: [
        {
          id: 'test-contest-1',
          type: 'candidate',
          title: 'Test Contest 1',
          districtId: unsafeParse(DistrictIdSchema, 'test-district-1'),
          seats: 1,
          partyId: unsafeParse(PartyIdSchema, 'test-party-1'),
          allowWriteIns: false,
          candidates: [
            {
              id: 'test-candidate-1',
              name: 'Test Candidate 1',
              firstName: 'Test',
              middleName: 'Candidate',
              lastName: '1',
              partyIds: [unsafeParse(PartyIdSchema, 'test-party-1')],
            },
            {
              id: 'test-candidate-2',
              name: 'Test Candidate 2',
              firstName: 'Test',
              middleName: 'Candidate',
              lastName: '2',
              partyIds: [unsafeParse(PartyIdSchema, 'test-party-1')],
            },
            {
              id: 'test-candidate-3',
              name: 'Test Candidate 3',
              firstName: 'Test',
              middleName: 'Candidate',
              lastName: '3',
              partyIds: [unsafeParse(PartyIdSchema, 'test-party-1')],
            },
          ],
        },
      ],
      seal: '',
      ballotLayout: {
        metadataEncoding: 'qr-code',
        paperSize: HmpbBallotPaperSize.Letter,
      },
      ballotStrings: {},
    },
    jurisdiction.id
  );
  const { election } = electionRecord;
  const electionId = election.id;
  const savedContest = election.contests.find(
    (contest): contest is CandidateContest => contest.type === 'candidate'
  )!;
  const savedDistrict = election.districts.find(
    (district) => district.id === savedContest.districtId
  )!;
  const savedParty = election.parties.find(
    (party) => party.id === savedContest.partyId
  )!;
  const updatedDistrict = election.districts.find(
    (district) => district.id !== savedContest.districtId
  )!;
  const updatedParty = election.parties.find(
    (party) => party.id !== savedContest.partyId
  )!;

  assert(savedContest.candidates.length > 2);
  const updatedContest: CandidateContest = {
    ...savedContest,
    title: 'Updated Contest Title',
    districtId: updatedDistrict.id,
    partyId: updatedParty.id,
    seats: savedContest.seats + 1,
    allowWriteIns: !savedContest.allowWriteIns,
    termDescription: 'Updated Term Description',
    candidates: [
      {
        ...savedContest.candidates[1],
        name: 'Updated Candidate Name',
        firstName: 'Updated',
        middleName: 'Candidate',
        lastName: 'Name',
        partyIds: undefined,
      },
      ...savedContest.candidates.slice(2),
    ],
  };

  apiMock.listContests
    .expectCallWith({ electionId })
    .resolves(election.contests);
  expectOtherElectionApiCalls(election);
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);

  const history = renderScreen(electionId);

  await navigateToContestView(history, electionId, savedContest.id);
  expectContestListItems(election.contests);

  userEvent.click(screen.getButton('Edit'));
  await screen.findByRole('heading', { name: 'Edit Contest' });

  // Change title
  const titleInput = screen.getByLabelText('Title');
  expect(titleInput).toHaveValue(savedContest.title);
  userEvent.clear(titleInput);
  userEvent.type(titleInput, updatedContest.title);

  // Change district
  userEvent.click(screen.getByText(savedDistrict.name));
  userEvent.click(screen.getByText(updatedDistrict.name));

  // Change party
  userEvent.click(
    within(
      screen.getByLabelText('Party').parentElement!.parentElement!
    ).getByText(savedParty.name)
  );
  userEvent.click(screen.getByText(updatedParty.name));

  // Change seats
  const seatsInput = screen.getByLabelText('Seats');
  expect(seatsInput).toHaveValue(savedContest.seats);
  userEvent.clear(seatsInput);
  userEvent.type(seatsInput, updatedContest.seats.toString());

  // Change term
  const termInput = screen.getByLabelText('Term');
  expect(termInput).toHaveValue(savedContest.termDescription ?? '');
  userEvent.clear(termInput);
  userEvent.type(termInput, updatedContest.termDescription!);

  // Change write-ins allowed
  const writeInsControl = screen.getByLabelText('Write-Ins Allowed?');
  within(writeInsControl).getByRole('option', {
    name: 'No',
    selected: true,
  });
  userEvent.click(within(writeInsControl).getByRole('option', { name: 'Yes' }));

  // Confirm candidates
  const candidateRows = screen.getAllByRole('row');
  expect(candidateRows).toHaveLength(savedContest.candidates.length + 1);
  for (const [i, candidate] of savedContest.candidates.entries()) {
    const row = candidateRows[i + 1];
    expect(
      within(row).getByLabelText(`Candidate ${i + 1} First Name`)
    ).toHaveValue(candidate.firstName);
    const party = election.parties.find(
      (p) => p.id === candidate.partyIds?.[0]
    )!;
    within(row).getByText(party.name);
  }

  // Edit candidate 2
  const nameUpdateSpec = [
    {
      labelText: 'First',
      nameValue: assertDefined(updatedContest.candidates[0].firstName),
    },
    {
      labelText: 'Middle',
      nameValue: assertDefined(updatedContest.candidates[0].middleName),
    },
    {
      labelText: 'Last',
      nameValue: assertDefined(updatedContest.candidates[0].lastName),
    },
  ];
  for (const spec of nameUpdateSpec) {
    const input = within(candidateRows[2]).getByLabelText(
      `Candidate 2 ${spec.labelText} Name`
    );
    userEvent.clear(input);
    userEvent.type(input, spec.nameValue);
  }

  const partySelect = within(candidateRows[2]).getByLabelText(
    'Candidate 2 Party'
  );
  userEvent.click(partySelect);
  userEvent.click(within(candidateRows[2]).getByText('No Party Affiliation'));

  // Remove candidate 1
  userEvent.click(
    within(candidateRows[1]).getByRole('button', {
      name: 'Remove Candidate Test Candidate 1',
    })
  );
  await waitFor(() => {
    expect(screen.getAllByRole('row')).toHaveLength(
      savedContest.candidates.length
    );
    expect(
      screen.queryByText(savedContest.candidates[0].name)
    ).not.toBeInTheDocument();
  });

  // Save contest
  apiMock.updateContest
    .expectCallWith({ electionId, updatedContest })
    .resolves(ok());
  apiMock.listContests
    .expectCallWith({ electionId })
    .resolves([updatedContest]);
  expectOtherElectionApiCalls(election);
  const saveButton = screen.getByRole('button', { name: 'Save' });
  userEvent.click(saveButton);

  await expectViewModeContest(history, electionId, updatedContest);
  expectContestListItems([updatedContest]);
});

interface NameTestSpec {
  description: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  expectedNormalizedName: string;
}

const nameTestSpecs: NameTestSpec[] = [
  {
    description: 'first and last name',
    firstName: 'Thomas',
    lastName: 'Edison',
    expectedNormalizedName: 'Thomas Edison',
  },
  {
    description: 'all name fields',
    firstName: 'Thomas',
    middleName: 'Alva',
    lastName: 'Edison',
    expectedNormalizedName: 'Thomas Alva Edison',
  },
  {
    description: 'whitespace',
    firstName: ' Thomas ',
    middleName: 'Alva',
    lastName: 'Edison ',
    expectedNormalizedName: 'Thomas Alva Edison',
  },
];
test.each(nameTestSpecs)(
  'name concatenation for test case: $description',
  async ({ firstName, middleName, lastName, expectedNormalizedName }) => {
    const { election } = electionWithNoContestsRecord;
    const electionId = election.id;
    const newContest: CandidateContest = {
      id: idFactory.next(),
      type: 'candidate',
      title: 'New Contest',
      districtId: election.districts[0].id,
      seats: 1,
      allowWriteIns: true,
      candidates: [
        {
          id: idFactory.next(),
          name: expectedNormalizedName,
          firstName: firstName.trim(),
          middleName: middleName?.trim(),
          lastName: lastName.trim(),
        },
      ],
    };

    apiMock.listContests.expectCallWith({ electionId }).resolves([]);
    expectOtherElectionApiCalls(election);
    apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);

    const history = renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Contests' });
    screen.getByText("You haven't added any contests to this election yet.");

    // Add contest
    userEvent.click(screen.getByRole('button', { name: 'Add Contest' }));
    await screen.findByRole('heading', { name: 'Add Contest' });

    // Set title
    userEvent.type(screen.getByLabelText('Title'), newContest.title);

    // Set district
    userEvent.click(screen.getByLabelText('District'));
    userEvent.click(screen.getByText(election.districts[0].name));

    // Default type is candidate contest
    within(screen.getByLabelText('Type')).getByRole('option', {
      name: 'Candidate Contest',
      selected: true,
    });

    // Set seats
    const seatsInput = screen.getByLabelText('Seats');
    expect(seatsInput).toHaveValue(1);
    userEvent.clear(seatsInput);
    userEvent.type(seatsInput, '1');

    // Add candidate
    screen.getByText("You haven't added any candidates to this contest yet.");
    userEvent.click(screen.getByRole('button', { name: 'Add Candidate' }));
    screen.getByRole('columnheader', { name: 'First Name' });
    screen.getByRole('columnheader', { name: 'Last Name' });
    screen.getByRole('columnheader', { name: 'Party' });
    const candidateRows = screen.getAllByRole('row');
    // First row is headers
    expect(candidateRows).toHaveLength(2);
    const row = candidateRows[1];

    // Set name
    userEvent.type(
      within(row).getByLabelText(`Candidate 1 First Name`),
      firstName
    );
    if (middleName) {
      userEvent.type(
        within(row).getByLabelText(`Candidate 1 Middle Name`),
        middleName
      );
    }
    if (lastName) {
      userEvent.type(
        within(row).getByLabelText(`Candidate 1 Last Name`),
        lastName
      );
    }

    // Save contest
    apiMock.createContest
      .expectCallWith({ electionId, newContest })
      .resolves(ok());
    apiMock.listContests
      .expectRepeatedCallsWith({ electionId })
      .resolves([newContest]);
    expectOtherElectionApiCalls(election);
    const saveButton = screen.getByRole('button', { name: 'Save' });
    userEvent.click(saveButton);

    await expectViewModeContest(history, electionId, newContest);
    expectContestListItems([newContest]);
  }
);

test('adding a ballot measure', async () => {
  const electionRecord = generalElectionRecord(jurisdiction.id);
  const { election } = electionRecord;
  const electionId = election.id;
  const id = idFactory.next();
  idFactory.next(); // Skip over the extra ballot measure ID created when switching to ballot measure type
  const newContest: YesNoContest = {
    type: 'yesno',
    title: 'New Ballot Measure',
    id,
    districtId: election.districts[0].id,
    description: 'New Ballot Measure Description',
    yesOption: {
      id: idFactory.next(),
      label: 'Yes',
    },
    noOption: {
      id: idFactory.next(),
      label: 'No',
    },
  };

  apiMock.listContests
    .expectCallWith({ electionId })
    .resolves(election.contests);
  expectOtherElectionApiCalls(election);
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);

  const history = renderScreen(electionId);

  await expectViewModeContest(history, electionId, election.contests[0]);
  expectContestListItems(election.contests);

  userEvent.click(screen.getByRole('button', { name: 'Add Contest' }));
  await screen.findByRole('heading', { name: 'Add Contest' });

  // Set title
  userEvent.type(screen.getByLabelText('Title'), newContest.title);

  // Set district
  userEvent.click(screen.getByLabelText('District'));
  userEvent.click(screen.getByText(election.districts[0].name));

  // Change type to ballot measure
  userEvent.click(screen.getByRole('option', { name: 'Ballot Measure' }));

  // Set description
  const descriptionEditor = within(
    screen.getByText('Description').parentElement!
  ).getByTestId('rich-text-editor');
  userEvent.type(
    descriptionEditor.querySelector('.tiptap p')!,
    newContest.description
  );
  await within(descriptionEditor).findByText(newContest.description);

  const inputs = getOptionInputs();
  expect(inputs).toHaveLength(2);
  const [yesInput, noInput] = inputs;
  expect(screen.queryButton('Add Option')).not.toBeInTheDocument();
  userEvent.clear(yesInput);
  userEvent.type(yesInput, newContest.yesOption.label);
  userEvent.clear(noInput);
  userEvent.type(noInput, newContest.noOption.label);

  await within(descriptionEditor).findByText(newContest.description);
  const descriptionHtml = `<p>${newContest.description}</p>`;

  // Save contest
  const newContestWithDescriptionHtml: YesNoContest = {
    ...newContest,
    description: descriptionHtml,
  };
  apiMock.createContest
    .expectCallWith({ electionId, newContest: newContestWithDescriptionHtml })
    .resolves(ok());

  const updatedContests = [...election.contests, newContestWithDescriptionHtml];
  apiMock.listContests
    .expectRepeatedCallsWith({ electionId })
    .resolves(updatedContests);

  expectOtherElectionApiCalls(election);
  const saveButton = screen.getByRole('button', { name: 'Save' });
  userEvent.click(saveButton);

  await expectViewModeContest(history, electionId, newContest);
  expectContestListItems(updatedContests);
});

test('editing a ballot measure', async () => {
  const electionRecord = generalElectionRecord(jurisdiction.id);
  const { election } = electionRecord;
  const electionId = election.id;
  const savedContest = election.contests.find(
    (contest): contest is YesNoContest => contest.type === 'yesno'
  )!;
  const savedDistrict = election.districts.find(
    (district) => district.id === savedContest.districtId
  )!;
  const updatedDistrict = election.districts.find(
    (district) => district.id !== savedContest.districtId
  )!;
  const updatedContest: YesNoContest = {
    ...savedContest,
    title: 'Updated Ballot Measure Title',
    districtId: updatedDistrict.id,
    description: 'Updated Ballot Measure Description',
    yesOption: {
      ...savedContest.yesOption,
      label: 'Yea',
    },
    noOption: {
      ...savedContest.noOption,
      label: 'Nay',
    },
  };

  apiMock.listContests
    .expectCallWith({ electionId })
    .resolves(election.contests);
  expectOtherElectionApiCalls(election);
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);

  const history = renderScreen(electionId);

  await navigateToContestView(history, electionId, savedContest.id);
  expectContestListItems(election.contests);

  userEvent.click(screen.getButton('Edit'));
  await screen.findByRole('heading', { name: 'Edit Contest' });

  // Change title
  const titleInput = screen.getByLabelText('Title');
  expect(titleInput).toHaveValue(savedContest.title);
  userEvent.clear(titleInput);
  userEvent.type(titleInput, updatedContest.title);

  // Change district
  userEvent.click(screen.getByText(savedDistrict.name));
  userEvent.click(screen.getByText(updatedDistrict.name));

  // Change description
  const descriptionEditor = within(
    screen.getByText('Description').parentElement!
  ).getByTestId('rich-text-editor');
  within(descriptionEditor).getByText(savedContest.description);
  // userEvent.type doesn't work for updating the content for some reason
  fireEvent.change(descriptionEditor.querySelector('.tiptap p')!, {
    target: { textContent: updatedContest.description },
  });
  await within(descriptionEditor).findByText(updatedContest.description);
  const descriptionHtml = `<p>${updatedContest.description}</p>`;

  // Change yes and no labels
  const [yesInput, noInput] = getOptionInputs();
  expect(yesInput).toHaveValue(savedContest.yesOption.label);
  userEvent.clear(yesInput);
  userEvent.type(yesInput, updatedContest.yesOption.label);

  expect(noInput).toHaveValue(savedContest.noOption.label);
  userEvent.clear(noInput);
  userEvent.type(noInput, updatedContest.noOption.label);

  // Save contest
  const updatedContestWithDescriptionHtml: YesNoContest = {
    ...updatedContest,
    description: descriptionHtml,
  };
  apiMock.updateContest
    .expectCallWith({
      electionId,
      updatedContest: updatedContestWithDescriptionHtml,
    })
    .resolves(ok());

  const updatedContestList = election.contests.map((contest) =>
    contest.id === savedContest.id ? updatedContestWithDescriptionHtml : contest
  );
  apiMock.listContests
    .expectCallWith({ electionId })
    .resolves(updatedContestList);
  expectOtherElectionApiCalls(election);
  const saveButton = screen.getByRole('button', { name: 'Save' });
  userEvent.click(saveButton);

  await expectViewModeContest(history, electionId, updatedContest);
  expectContestListItems(updatedContestList);
});

test('features.ADDITIONAL_BALLOT_MEASURE_OPTIONS enables adding/removing additional options', async () => {
  const electionRecord = generalElectionRecord(jurisdiction.id);
  const { election } = electionRecord;
  const electionId = election.id;
  const savedContest = election.contests.find(
    (contest): contest is YesNoContest => contest.type === 'yesno'
  )!;

  apiMock.listContests
    .expectCallWith({ electionId })
    .resolves(election.contests);
  expectOtherElectionApiCalls(election);
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);

  const history = renderScreen(electionId, {
    ADDITIONAL_BALLOT_MEASURE_OPTIONS: true,
  });
  await navigateToContestEdit(history, electionId, savedContest.id);

  userEvent.click(screen.getButton('Add Option'));
  let optionInputs = getOptionInputs();
  expect(optionInputs).toHaveLength(3);

  const [yesInput, noInput, additionalInput] = optionInputs;
  expect(yesInput).toHaveValue(savedContest.yesOption.label);
  expect(noInput).toHaveValue(savedContest.noOption.label);
  expect(additionalInput).toHaveValue('');

  userEvent.type(additionalInput, 'Third Option');
  expect(additionalInput).toHaveValue('Third Option');

  userEvent.click(screen.getButton('Add Option'));
  const updatedOptionInputs = getOptionInputs();
  expect(updatedOptionInputs).toHaveLength(4);
  const [, , , fourthInput] = updatedOptionInputs;
  userEvent.type(fourthInput, 'Fourth Option');

  const updatedContest: YesNoContest = {
    ...savedContest,
    additionalOptions: [
      { id: idFactory.next(), label: 'Third Option' },
      { id: idFactory.next(), label: 'Fourth Option' },
    ],
  };
  apiMock.updateContest
    .expectCallWith({
      electionId,
      updatedContest,
    })
    .resolves(ok());
  const updatedContestList = election.contests.map((contest) =>
    contest.id === savedContest.id ? updatedContest : contest
  );
  apiMock.listContests
    .expectCallWith({ electionId })
    .resolves(updatedContestList);
  expectOtherElectionApiCalls(election);
  userEvent.click(screen.getButton('Save'));
  await expectViewModeContest(history, electionId, updatedContest);

  optionInputs = getOptionInputs();
  expect(optionInputs).toHaveLength(4);
  for (const input of optionInputs) {
    expect(input).toBeDisabled();
  }
  expect(optionInputs[0]).toHaveValue(savedContest.yesOption.label);
  expect(optionInputs[1]).toHaveValue(savedContest.noOption.label);
  expect(optionInputs[2]).toHaveValue('Third Option');
  expect(optionInputs[3]).toHaveValue('Fourth Option');
  expect(screen.getButton('Add Option')).toBeDisabled();
  expect(screen.queryButton('Remove Option')).not.toBeInTheDocument();

  await navigateToContestEdit(history, electionId, savedContest.id);
  const [, , thirdInput] = getOptionInputs();
  userEvent.click(within(thirdInput.parentElement!).getButton('Remove Option'));
  const updatedContest2: YesNoContest = {
    ...updatedContest,
    additionalOptions: updatedContest.additionalOptions!.slice(1),
  };
  apiMock.updateContest
    .expectCallWith({
      electionId,
      updatedContest: updatedContest2,
    })
    .resolves(ok());
  const updatedContestList2 = election.contests.map((contest) =>
    contest.id === savedContest.id ? updatedContest2 : contest
  );
  apiMock.listContests
    .expectCallWith({ electionId })
    .resolves(updatedContestList2);
  expectOtherElectionApiCalls(election);
  userEvent.click(screen.getButton('Save'));
  await expectViewModeContest(history, electionId, updatedContest2);
});

test('reordering contests', async () => {
  const electionRecord = generalElectionRecord(jurisdiction.id);
  const { election } = electionRecord;
  const electionId = election.id;

  apiMock.listContests
    .expectCallWith({ electionId })
    .resolves(election.contests);
  expectOtherElectionApiCalls(election);
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);

  let reorder: ((params: ReorderParams) => void) | undefined;
  MockContestList.mockImplementation((props) => {
    reorder = props.reorder;

    return <div data-testid={MOCK_CONTEST_LIST_ID} />;
  });

  const history = renderScreen(electionId);

  await expectViewModeContest(history, electionId, election.contests[0]);
  assert(reorder);

  userEvent.click(screen.getByRole('button', { name: 'Reorder Contests' }));
  expect(screen.getByRole('button', { name: 'Add Contest' })).toBeDisabled();
  expectContestListItems(election.contests);

  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expectContestListItems(election.contests);

  userEvent.click(screen.getByRole('button', { name: 'Reorder Contests' }));

  const [contest1, contest2, contest3] = election.contests;
  act(() => reorder!({ id: contest1.id, direction: 1 }));
  act(() => reorder!({ id: contest3.id, direction: -1 }));

  const reorderedContests = [
    contest2,
    contest3,
    contest1,
    ...election.contests.slice(3),
  ];
  expectContestListItems(reorderedContests);

  apiMock.reorderContests
    .expectCallWith({
      electionId,
      contestIds: reorderedContests.map((contest) => contest.id),
    })
    .resolves();

  apiMock.listContests
    .expectCallWith({ electionId })
    .resolves(reorderedContests);

  expectOtherElectionApiCalls(election);

  userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await screen.findByRole('button', { name: 'Reorder Contests' });
  expectContestListItems(reorderedContests);
});

test('deleting a contest', async () => {
  const electionRecord = generalElectionRecord(jurisdiction.id);
  const { election } = electionRecord;
  const electionId = election.id;
  const [savedContest] = election.contests;

  apiMock.listContests
    .expectCallWith({ electionId })
    .resolves(election.contests);
  expectOtherElectionApiCalls(election);
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);

  const history = renderScreen(electionId);

  const contestRoutes = routes.election(electionId).contests;
  history.replace(contestRoutes.edit(savedContest.id).path);
  await screen.findByRole('heading', { name: 'Edit Contest' });

  apiMock.deleteContest
    .expectCallWith({ electionId, contestId: savedContest.id })
    .resolves();

  const remainingContests = election.contests.slice(1);
  apiMock.listContests
    .expectCallWith({ electionId })
    .resolves(remainingContests);

  expectOtherElectionApiCalls(election);

  // Initiate the deletion
  userEvent.click(screen.getByRole('button', { name: 'Delete Contest' }));
  // Confirm the deletion in the modal
  userEvent.click(screen.getByRole('button', { name: 'Delete Contest' }));

  // Should auto-select the first of the remaining contests:
  await expectViewModeContest(history, electionId, remainingContests[0]);
  expectContestListItems(remainingContests);
});

test('editing contests is restricted for elections with external source', async () => {
  const electionRecord = generalElectionRecord(jurisdiction.id);
  const { election } = electionRecord;
  const electionId = election.id;

  const candidateContest = election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate'
  )!;
  const yesNoContest = election.contests.find(
    (c): c is YesNoContest => c.type === 'yesno'
  )!;

  apiMock.listContests
    .expectCallWith({ electionId })
    .resolves(election.contests);
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);

  // Override getElectionInfo to return an election with external source
  apiMock.getElectionInfo.expectRepeatedCallsWith({ electionId }).resolves({
    ...electionInfoFromElection(election),
    externalSource: 'ms-sems',
  });

  apiMock.getSystemSettings
    .expectOptionalRepeatedCallsWith({ electionId })
    .resolves(DEFAULT_SYSTEM_SETTINGS);
  apiMock.listDistricts
    .expectCallWith({ electionId })
    .resolves(election.districts);
  apiMock.listParties.expectCallWith({ electionId }).resolves(election.parties);

  const history = renderScreen(electionId);

  await screen.findByRole('heading', { name: 'Contest Info' });

  // --- Verify Add Contest and Reorder buttons are hidden ---
  expect(screen.queryButton('Add Contest')).not.toBeInTheDocument();
  expect(screen.queryButton('Reorder Contests')).not.toBeInTheDocument();

  // --- Test candidate contest restrictions ---
  await navigateToContestView(history, electionId, candidateContest.id);

  userEvent.click(screen.getButton('Edit'));
  await screen.findByRole('heading', { name: 'Edit Contest' });

  // District select should be disabled
  const districtSelect = screen.getByLabelText('District');
  expect(districtSelect).toBeDisabled();

  // Type toggle should only show the current type option
  const typeOptions = screen.getAllByRole('option');
  const candidateOption = typeOptions.find(
    (o) => o.textContent === 'Candidate Contest'
  );
  const ballotMeasureOption = typeOptions.find(
    (o) => o.textContent === 'Ballot Measure'
  );
  expect(candidateOption).toBeDefined();
  expect(ballotMeasureOption).toBeUndefined();

  // Candidate name inputs should be disabled
  const candidateRows = screen.getAllByRole('row').slice(1); // Skip header row
  for (let i = 0; i < candidateContest.candidates.length; i += 1) {
    const row = candidateRows[i];
    expect(
      within(row).getByLabelText(`Candidate ${i + 1} First Name`)
    ).toBeDisabled();
    expect(
      within(row).getByLabelText(`Candidate ${i + 1} Middle Name`)
    ).toBeDisabled();
    expect(
      within(row).getByLabelText(`Candidate ${i + 1} Last Name`)
    ).toBeDisabled();
  }

  // Add Candidate button should not be visible
  expect(screen.queryButton('Add Candidate')).not.toBeInTheDocument();

  // Remove Candidate buttons should not be visible
  expect(
    screen.queryByRole('button', { name: /Remove Candidate/i })
  ).not.toBeInTheDocument();

  // Delete Contest button should not be visible
  expect(screen.queryButton('Delete Contest')).not.toBeInTheDocument();

  // --- Test ballot measure contest restrictions ---
  await navigateToContestView(history, electionId, yesNoContest.id);

  userEvent.click(screen.getButton('Edit'));
  await screen.findByRole('heading', { name: 'Edit Contest' });

  // Type toggle should only show the current type option (Ballot Measure)
  const ballotMeasureTypeOptions = screen.getAllByRole('option');
  const ballotMeasureOptionVisible = ballotMeasureTypeOptions.find(
    (o) => o.textContent === 'Ballot Measure'
  );
  const candidateOptionHidden = ballotMeasureTypeOptions.find(
    (o) => o.textContent === 'Candidate Contest'
  );
  expect(ballotMeasureOptionVisible).toBeDefined();
  expect(candidateOptionHidden).toBeUndefined();

  // Option label inputs should be disabled
  const [yesInput, noInput] = getOptionInputs();
  expect(yesInput).toBeDisabled();
  expect(noInput).toBeDisabled();

  // Delete Contest button should not be visible
  expect(screen.queryButton('Delete Contest')).not.toBeInTheDocument();
});

test('changing contests is disabled when ballots are finalized', async () => {
  const electionRecord = generalElectionRecord(jurisdiction.id);
  const { election } = electionRecord;
  const electionId = election.id;
  // Mock needed for react-flip-toolkit
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: false,
  }));

  apiMock.listContests
    .expectCallWith({ electionId })
    .resolves(election.contests);
  expectOtherElectionApiCalls(election);
  apiMock.getBallotsFinalizedAt
    .expectCallWith({ electionId })
    .resolves(new Date());

  const history = renderScreen(electionId);

  await screen.findByRole('heading', { name: 'Contests' });

  expect(
    screen.getByRole('button', { name: 'Reorder Contests' })
  ).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Add Contest' })).toBeDisabled();

  const contestRoutes = routes.election(electionId).contests;
  const [, contest2, contest3] = election.contests;

  await navigateToContestView(history, electionId, contest2.id);
  expect(screen.queryButton('Edit')).not.toBeInTheDocument();
  expect(screen.queryButton('Save')).not.toBeInTheDocument();
  expect(screen.queryButton('Cancel')).not.toBeInTheDocument();
  expect(screen.queryButton('Delete Contest')).not.toBeInTheDocument();

  // Accessing `/edit` route when finalized should redirect to "view" route:
  history.replace(contestRoutes.edit(contest3.id).path);
  await waitFor(() => expectViewModeContest(history, electionId, contest3));
  expect(screen.queryButton('Edit')).not.toBeInTheDocument();
  expect(screen.queryButton('Save')).not.toBeInTheDocument();
  expect(screen.queryButton('Cancel')).not.toBeInTheDocument();
  expect(screen.queryButton('Delete Contest')).not.toBeInTheDocument();
});

test('cancelling', async () => {
  const electionRecord = generalElectionRecord(jurisdiction.id);
  const { election } = electionRecord;
  const electionId = election.id;

  apiMock.listContests
    .expectCallWith({ electionId })
    .resolves(election.contests);
  expectOtherElectionApiCalls(election);
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);

  const history = renderScreen(electionId);

  const contest = election.contests.find(
    (c): c is YesNoContest => c.type === 'yesno'
  )!;
  await navigateToContestView(history, electionId, contest.id);
  await expectViewModeContest(history, electionId, contest);

  userEvent.click(screen.getButton('Edit'));
  await screen.findByRole('heading', { name: 'Edit Contest' });

  userEvent.click(screen.getByRole('button', { name: 'Delete Contest' }));
  await screen.findByRole('heading', { name: 'Delete Contest' });

  // Cancel delete contest confirmation modal
  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => {
    expect(
      screen.queryByRole('heading', { name: 'Delete Contest' })
    ).not.toBeInTheDocument();
  });

  // Make sure we reset to saved contest state after making edits
  userEvent.type(screen.getByLabelText('Title'), ' - Edited');
  let descriptionEditor = within(
    screen.getByText('Description').parentElement!
  ).getByTestId('rich-text-editor');
  // userEvent.type doesn't work for updating the content for some reason
  fireEvent.change(descriptionEditor.querySelector('.tiptap p')!, {
    target: { textContent: 'Edited Description' },
  });
  await within(descriptionEditor).findByText('Edited Description');

  // Cancel edit contest
  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(history.location.pathname).toEqual(
    routes.election(electionId).contests.view(contest.id).path
  );
  expect(screen.getByLabelText('Title')).toHaveValue(contest.title);
  descriptionEditor = within(
    screen.getByText('Description').parentElement!
  ).getByTestId('rich-text-editor');
  within(descriptionEditor).getByText(contest.description);
  await screen.findByRole('heading', { name: 'Contests' });
});

test('error messages for duplicate candidate contest/candidates', async () => {
  const electionRecord = generalElectionRecord(jurisdiction.id);
  const { election } = electionRecord;
  const electionId = election.id;

  apiMock.listContests
    .expectCallWith({ electionId })
    .resolves(election.contests);
  expectOtherElectionApiCalls(election);
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);

  const history = renderScreen(electionId);
  await expectViewModeContest(history, electionId, election.contests[0]);
  await navigateToContestEdit(history, electionId, election.contests[1].id);

  // Mock the duplicate contest error, even though we didn't actually change anything
  apiMock.updateContest
    .expectCallWith({
      electionId,
      updatedContest: election.contests[1],
    })
    .resolves(err('duplicate-contest'));
  userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await screen.findByText(
    'There is already a contest with the same district, title, seats, and term.'
  );

  // Mock the duplicate candidate error
  apiMock.updateContest
    .expectCallWith({
      electionId,
      updatedContest: election.contests[1],
    })
    .resolves(err('duplicate-candidate'));
  userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await screen.findByText('Candidates must have different names.');
});

test('error messages for duplicate ballot measure', async () => {
  const electionRecord = generalElectionRecord(jurisdiction.id);
  const { election } = electionRecord;
  const electionId = election.id;
  const ballotMeasureContest = find(
    election.contests,
    (contest): contest is YesNoContest => contest.type === 'yesno'
  );

  apiMock.listContests
    .expectCallWith({ electionId })
    .resolves(election.contests);
  expectOtherElectionApiCalls(election);
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);

  const history = renderScreen(electionId);
  await expectViewModeContest(history, electionId, election.contests[0]);
  await navigateToContestEdit(history, electionId, ballotMeasureContest.id);

  // Mock the duplicate contest error, even though we didn't actually change anything
  apiMock.updateContest
    .expectCallWith({
      electionId,
      updatedContest: ballotMeasureContest,
    })
    .resolves(err('duplicate-contest'));
  userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await screen.findByText(
    'There is already a contest with the same district and title.'
  );

  // Mock the duplicate option error
  apiMock.updateContest
    .expectCallWith({
      electionId,
      updatedContest: ballotMeasureContest,
    })
    .resolves(err('duplicate-option'));
  userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await screen.findByText('Options must have different labels.');
});

test('error messages for candidate contest with no candidates and write-ins disallowed', async () => {
  const electionRecord = generalElectionRecord(jurisdiction.id);
  const { election } = electionRecord;
  const electionId = election.id;
  const candidateContest = find(
    election.contests,
    (contest): contest is CandidateContest => contest.type === 'candidate'
  );

  apiMock.listContests
    .expectCallWith({ electionId })
    .resolves(election.contests);
  expectOtherElectionApiCalls(election);
  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);

  const history = renderScreen(electionId);
  await expectViewModeContest(history, electionId, election.contests[0]);
  await navigateToContestEdit(history, electionId, candidateContest.id);

  // Remove all candidates
  for (const row of screen.getAllByRole('row').slice(1)) {
    userEvent.click(within(row).getByRole('button', { name: /Remove/ }));
  }
  // Disallow write-ins
  const writeInsControl = screen.getByLabelText('Write-Ins Allowed?');
  userEvent.click(within(writeInsControl).getByRole('option', { name: 'No' }));
  expect(
    within(writeInsControl).getByRole('option', { name: 'No' })
  ).toHaveAttribute('aria-selected', 'true');

  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText(
    /contest must have at least one candidate or allow write-ins./i
  );
});

test('disables form and shows edit button when in "view" mode', async () => {
  const electionRecord = generalElectionRecord(jurisdiction.id);
  const { election } = electionRecord;
  const electionId = election.id;
  const [savedContest] = election.contests;

  apiMock.listContests
    .expectCallWith({ electionId })
    .resolves(election.contests);
  expectOtherElectionApiCalls(election);

  apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);

  const history = renderScreen(electionId);
  await navigateToContestView(history, electionId, savedContest.id);

  // Initial "view" state:

  screen.getButton('Edit');
  screen.getButton('Delete Contest');
  expect(screen.queryButton('Cancel')).not.toBeInTheDocument();
  expect(screen.queryButton('Save')).not.toBeInTheDocument();
  expect(screen.queryButton(/Remove Candidate/)).not.toBeInTheDocument();

  const inputs = screen.queryAllByRole('textbox');
  expect(inputs.length).toBeGreaterThan(0);
  for (const input of inputs) expect(input).toBeDisabled();

  const options = screen.queryAllByRole('option');
  expect(options.length).toBeGreaterThan(0);
  for (const option of options) expect(option).toBeDisabled();

  // Switch to "edit" state:

  userEvent.click(screen.getButton('Edit'));

  await screen.findButton('Save');
  screen.getButton('Cancel');
  screen.getButton('Delete Contest');
  expect(screen.queryButton('Edit')).not.toBeInTheDocument();
});

describe('audio editing', () => {
  const electionRecord = generalElectionRecord(jurisdiction.id);
  const { election } = electionRecord;
  const electionId = election.id;

  const candidateContest: CandidateContest = {
    ...find(
      election.contests,
      (contest): contest is CandidateContest => contest.type === 'candidate'
    ),
    candidates: [
      {
        id: 'candidate-1',
        name: 'Candidate M. One',

        firstName: 'Candidate',
        middleName: 'No.',
        lastName: 'One',
      },
      {
        id: 'candidate-2',
        name: 'Candidate Two',

        firstName: 'Candidate',
        lastName: 'Two',
      },
    ],
    termDescription: '2 Years',
  };

  const yesNoContest = find(
    election.contests,
    (contest): contest is YesNoContest => contest.type === 'yesno'
  );

  test(`configures audio edit buttons for candidates`, async () => {
    apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
    expectOtherElectionApiCalls(election);

    apiMock.listContests
      .expectCallWith({ electionId })
      .resolves([candidateContest]);

    const history = renderScreen(electionId, { AUDIO_ENABLED: true });

    const labelText = await screen.findByText('Candidates');
    const group = within(assertDefined(labelText.parentElement));

    group.getButton('Preview or Edit Audio: Candidate No. One');
    userEvent.click(group.getButton('Preview or Edit Audio: Candidate Two'));

    await screen.findByTestId(MOCK_AUDIO_PANEL_ID);
    expect(history.location.pathname).toEqual(
      routes.election(electionId).contests.audio({
        contestId: candidateContest.id,
        stringKey: ElectionStringKey.CANDIDATE_NAME,
        subkey: 'candidate-2',
      })
    );
  });

  interface AudioEnabledInputSpec {
    contest: AnyContest;
    inputLabel: string;
    stringKey: ElectionStringKey;
    subkey: string;
  }

  for (const spec of [
    {
      inputLabel: 'Title',
      contest: candidateContest,
      stringKey: ElectionStringKey.CONTEST_TITLE,
      subkey: candidateContest.id,
    },
    {
      inputLabel: 'Term',
      contest: candidateContest,
      stringKey: ElectionStringKey.CONTEST_TERM,
      subkey: candidateContest.id,
    },
    {
      inputLabel: 'Term',
      contest: candidateContest,
      stringKey: ElectionStringKey.CONTEST_TERM,
      subkey: candidateContest.id,
    },

    {
      inputLabel: 'Title',
      contest: yesNoContest,
      stringKey: ElectionStringKey.CONTEST_TITLE,
      subkey: yesNoContest.id,
    },
    {
      inputLabel: 'Description',
      contest: yesNoContest,
      stringKey: ElectionStringKey.CONTEST_DESCRIPTION,
      subkey: yesNoContest.id,
    },
  ] as AudioEnabledInputSpec[]) {
    test(`configures audio edit button for ${spec.inputLabel}`, async () => {
      expectOtherElectionApiCalls(election);
      apiMock.getBallotsFinalizedAt
        .expectCallWith({ electionId })
        .resolves(null);

      apiMock.listContests
        .expectCallWith({ electionId })
        .resolves([spec.contest]);

      const history = renderScreen(electionId, { AUDIO_ENABLED: true });

      const labelText = await screen.findByText(spec.inputLabel);
      const inputGroup = assertDefined(labelText.parentElement);
      const button = within(inputGroup).getButton(/preview or edit audio/i);

      userEvent.click(button);

      await screen.findByTestId(MOCK_AUDIO_PANEL_ID);
      expect(history.location.pathname).toEqual(
        routes.election(electionId).contests.audio({
          contestId: spec.contest.id,
          stringKey: spec.stringKey,
          subkey: spec.subkey,
        })
      );
    });
  }

  test('configures audio edit buttons for option labels', async () => {
    expectOtherElectionApiCalls(election);
    apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);

    apiMock.listContests
      .expectCallWith({ electionId })
      .resolves([yesNoContest]);

    const history = renderScreen(electionId, { AUDIO_ENABLED: true });
    await navigateToContestView(history, electionId, yesNoContest.id);

    const [yesInput] = getOptionInputs();
    const yesAudioButton = within(yesInput.parentElement!).getButton(
      /preview or edit audio/i
    );
    userEvent.click(yesAudioButton);
    await screen.findByTestId(MOCK_AUDIO_PANEL_ID);
    expect(history.location.pathname).toEqual(
      routes.election(electionId).contests.audio({
        contestId: yesNoContest.id,
        stringKey: ElectionStringKey.CONTEST_OPTION_LABEL,
        subkey: yesNoContest.yesOption.id,
      })
    );
    await navigateToContestView(history, electionId, yesNoContest.id);

    const [, noInput] = getOptionInputs();
    const noAudioButton = within(noInput.parentElement!).getButton(
      /preview or edit audio/i
    );
    userEvent.click(noAudioButton);
    await screen.findByTestId(MOCK_AUDIO_PANEL_ID);
    expect(history.location.pathname).toEqual(
      routes.election(electionId).contests.audio({
        contestId: yesNoContest.id,
        stringKey: ElectionStringKey.CONTEST_OPTION_LABEL,
        subkey: yesNoContest.noOption.id,
      })
    );
  });
});

function expectContestListItems(contests: Contests) {
  expectContestListProps({
    candidateContests: contests.filter((c) => c.type === 'candidate'),
    yesNoContests: contests.filter((c) => c.type === 'yesno'),
  });
}

function expectContestListProps(partialProps: Partial<ContestListProps>) {
  screen.getByTestId(MOCK_CONTEST_LIST_ID);
  expect(MockContestList.mock.lastCall?.[0]).toMatchObject(partialProps);
}

async function expectViewModeContest(
  history: MemoryHistory,
  electionId: string,
  contest: Contest
) {
  await screen.findByRole('heading', { name: 'Contest Info' });
  expect(screen.getByLabelText('Title')).toHaveValue(contest.title);
  expect(history.location.pathname).toEqual(
    routes.election(electionId).contests.view(contest.id).path
  );
}

async function navigateToContestEdit(
  history: MemoryHistory,
  electionId: string,
  contestId: string
) {
  history.replace(routes.election(electionId).contests.edit(contestId).path);
  await screen.findByRole('heading', { name: 'Edit Contest' });
}

async function navigateToContestView(
  history: MemoryHistory,
  electionId: string,
  contestId: string
) {
  history.replace(routes.election(electionId).contests.view(contestId).path);
  await screen.findByRole('heading', { name: 'Contest Info' });
}

function getOptionInputs() {
  const inputs = within(
    screen.getByText('Options').parentElement!
  ).getAllByRole('textbox');
  return inputs;
}
