import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryHistory } from 'history';
import userEvent from '@testing-library/user-event';
import type { ElectionRecord } from '@votingworks/design-backend';
import {
  BallotStyleGroupIdSchema,
  BallotStyleIdSchema,
  CandidateContest,
  DistrictIdSchema,
  ElectionId,
  ElectionIdSchema,
  HmpbBallotPaperSize,
  Party,
  PartyId,
  PartyIdSchema,
  PrecinctIdSchema,
  unsafeParse,
  YesNoContest,
} from '@votingworks/types';
import { assert, assertDefined, DateWithoutTime } from '@votingworks/basics';
import { readElectionGeneral } from '@votingworks/fixtures';
import {
  MockApiClient,
  createMockApiClient,
  mockUserFeatures,
  provideApi,
  user,
} from '../test/api_helpers';
import { generalElectionRecord, makeElectionRecord } from '../test/fixtures';
import {
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

let apiMock: MockApiClient;

const idFactory = makeIdFactory();

beforeEach(() => {
  apiMock = createMockApiClient();
  idFactory.reset();
  mockUserFeatures(apiMock, user);
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderScreen(electionId: ElectionId) {
  const { path } = routes.election(electionId).contests.root;
  const history = createMemoryHistory({ initialEntries: [path] });
  render(
    provideApi(
      apiMock,
      withRoute(<ContestsScreen />, {
        paramPath: routes.election(':electionId').contests.root.path,
        path,
      })
    )
  );
  return history;
}

const electionWithNoContestsRecord = makeElectionRecord(
  {
    id: unsafeParse(ElectionIdSchema, 'test-general-election'),
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
      },
      {
        id: 'test-precinct-2',
        name: 'Test Precinct 2',
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
  user.orgId
);

describe('Contests tab', () => {
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

    apiMock.getUser.expectRepeatedCallsWith().resolves(user);
    apiMock.getElection
      .expectCallWith({ electionId, user })
      .resolves(electionWithNoContestsRecord);
    apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Contests' });
    screen.getByRole('tab', { name: 'Contests', selected: true });
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
    userEvent.click(
      within(writeInsControl).getByRole('option', { name: 'No' })
    );

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
      const partySelect = within(row).getByLabelText(
        `Candidate ${i + 1} Party`
      );
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
    const electionWithNewContestRecord: ElectionRecord = {
      ...electionWithNoContestsRecord,
      election: {
        ...election,
        contests: [newContest],
      },
    };
    apiMock.updateElection
      .expectCallWith({
        electionId,
        election: electionWithNewContestRecord.election,
      })
      .resolves();
    apiMock.getElection
      .expectCallWith({ electionId, user })
      .resolves(electionWithNewContestRecord);
    const saveButton = screen.getByRole('button', { name: 'Save' });
    userEvent.click(saveButton);

    await screen.findByRole('heading', { name: 'Contests' });
    screen.getByRole('tab', { name: 'Contests', selected: true });
    screen.getByRole('columnheader', { name: 'Title' });
    screen.getByRole('columnheader', { name: 'District' });
    const rows = screen.getAllByRole('row');
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(
      within(rows[1])
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    ).toEqual([
      newContest.title,
      'Candidate Contest',
      election.districts[0].name,
      'Edit',
    ]);
  });

  test('editing a candidate contest (primary election)', async () => {
    const electionRecord = makeElectionRecord(
      {
        id: unsafeParse(ElectionIdSchema, 'test-primary-election'),
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
          },
          {
            id: 'test-precinct-2',
            name: 'Test Precinct 2',
          },
        ],
        ballotStyles: [
          {
            id: unsafeParse(BallotStyleIdSchema, 'test-ballot-style-1'),
            groupId: unsafeParse(
              BallotStyleGroupIdSchema,
              'test-ballot-group-1'
            ),
            districts: [unsafeParse(DistrictIdSchema, 'test-district-1')],
            precincts: [unsafeParse(PrecinctIdSchema, 'test-precinct-1')],
            partyId: unsafeParse(PartyIdSchema, 'test-party-1'),
          },
          {
            id: unsafeParse(BallotStyleIdSchema, 'test-ballot-style-2'),
            groupId: unsafeParse(
              BallotStyleGroupIdSchema,
              'test-ballot-group-2'
            ),
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
      user.orgId
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
    const changedDistrict = election.districts.find(
      (district) => district.id !== savedContest.districtId
    )!;
    const changedParty = election.parties.find(
      (party) => party.id !== savedContest.partyId
    )!;

    assert(savedContest.candidates.length > 2);
    const changedContest: CandidateContest = {
      ...savedContest,
      title: 'Changed Contest Title',
      districtId: changedDistrict.id,
      partyId: changedParty.id,
      seats: savedContest.seats + 1,
      allowWriteIns: !savedContest.allowWriteIns,
      termDescription: 'Changed Term Description',
      candidates: [
        {
          ...savedContest.candidates[1],
          name: 'Changed Candidate Name',
          firstName: 'Changed',
          middleName: 'Candidate',
          lastName: 'Name',
          partyIds: undefined,
        },
        ...savedContest.candidates.slice(2),
      ],
    };

    apiMock.getUser.expectRepeatedCallsWith().resolves(user);
    apiMock.getElection
      .expectCallWith({ electionId, user })
      .resolves(electionRecord);
    apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Contests' });
    await screen.findByRole('tab', { name: 'Contests', selected: true });
    screen.getByRole('columnheader', { name: 'Title' });
    screen.getByRole('columnheader', { name: 'District' });
    screen.getByRole('columnheader', { name: 'Party' });
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(election.contests.length + 1);

    const savedContestRow = screen.getByText(savedContest.title).closest('tr')!;
    within(savedContestRow).getByText('Candidate Contest');
    within(savedContestRow).getByText(savedDistrict.name);
    within(savedContestRow).getByText(savedParty.name);
    userEvent.click(
      within(savedContestRow).getByRole('button', { name: 'Edit' })
    );

    await screen.findByRole('heading', { name: 'Edit Contest' });

    // Change title
    const titleInput = screen.getByLabelText('Title');
    expect(titleInput).toHaveValue(savedContest.title);
    userEvent.clear(titleInput);
    userEvent.type(titleInput, changedContest.title);

    // Change district
    userEvent.click(screen.getByText(savedDistrict.name));
    userEvent.click(screen.getByText(changedDistrict.name));

    // Change party
    userEvent.click(
      within(
        screen.getByLabelText('Party').parentElement!.parentElement!
      ).getByText(savedParty.name)
    );
    userEvent.click(screen.getByText(changedParty.name));

    // Change seats
    const seatsInput = screen.getByLabelText('Seats');
    expect(seatsInput).toHaveValue(savedContest.seats);
    userEvent.clear(seatsInput);
    userEvent.type(seatsInput, changedContest.seats.toString());

    // Change term
    const termInput = screen.getByLabelText('Term');
    expect(termInput).toHaveValue(savedContest.termDescription ?? '');
    userEvent.clear(termInput);
    userEvent.type(termInput, changedContest.termDescription!);

    // Change write-ins allowed
    const writeInsControl = screen.getByLabelText('Write-Ins Allowed?');
    within(writeInsControl).getByRole('option', {
      name: 'No',
      selected: true,
    });
    userEvent.click(
      within(writeInsControl).getByRole('option', { name: 'Yes' })
    );

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
        nameValue: assertDefined(changedContest.candidates[0].firstName),
      },
      {
        labelText: 'Middle',
        nameValue: assertDefined(changedContest.candidates[0].middleName),
      },
      {
        labelText: 'Last',
        nameValue: assertDefined(changedContest.candidates[0].lastName),
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
      within(candidateRows[1]).getByRole('button', { name: 'Remove' })
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
    const electionWithChangedContestRecord: ElectionRecord = {
      ...electionRecord,
      election: {
        ...election,
        contests: election.contests.map((contest) =>
          contest.id === savedContest.id ? changedContest : contest
        ),
      },
    };
    apiMock.updateElection
      .expectCallWith({
        electionId,
        election: electionWithChangedContestRecord.election,
      })
      .resolves();
    apiMock.getElection
      .expectCallWith({ electionId, user })
      .resolves(electionWithChangedContestRecord);
    const saveButton = screen.getByRole('button', { name: 'Save' });
    userEvent.click(saveButton);

    await screen.findByRole('heading', { name: 'Contests' });

    const changedContestRow = screen
      .getByText(changedContest.title)
      .closest('tr')!;
    within(changedContestRow).getByText('Candidate Contest');
    within(changedContestRow).getByText(changedDistrict.name);
    within(changedContestRow).getByText(changedParty.name);
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

      apiMock.getUser.expectRepeatedCallsWith().resolves(user);
      apiMock.getElection
        .expectCallWith({ electionId, user })
        .resolves(electionWithNoContestsRecord);
      apiMock.getBallotsFinalizedAt
        .expectCallWith({ electionId })
        .resolves(null);
      renderScreen(electionId);

      await screen.findByRole('heading', { name: 'Contests' });
      screen.getByRole('tab', { name: 'Contests', selected: true });
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
      const electionWithNewContestRecord: ElectionRecord = {
        ...electionWithNoContestsRecord,
        election: {
          ...election,
          contests: [newContest],
        },
      };
      apiMock.updateElection
        .expectCallWith({
          electionId,
          election: electionWithNewContestRecord.election,
        })
        .resolves();
      apiMock.getElection
        .expectCallWith({ electionId, user })
        .resolves(electionWithNewContestRecord);
      const saveButton = screen.getByRole('button', { name: 'Save' });
      userEvent.click(saveButton);

      await screen.findByRole('heading', { name: 'Contests' });
      screen.getByRole('tab', { name: 'Contests', selected: true });
      screen.getByRole('columnheader', { name: 'Title' });
      screen.getByRole('columnheader', { name: 'District' });
      const rows = screen.getAllByRole('row');
      expect(screen.getAllByRole('row')).toHaveLength(2);
      expect(
        within(rows[1])
          .getAllByRole('cell')
          .map((cell) => cell.textContent)
      ).toEqual([
        newContest.title,
        'Candidate Contest',
        election.districts[0].name,
        'Edit',
      ]);
    }
  );

  test('adding a ballot measure', async () => {
    const electionRecord = generalElectionRecord(user.orgId);
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

    apiMock.getUser.expectRepeatedCallsWith().resolves(user);
    apiMock.getElection
      .expectCallWith({ electionId, user })
      .resolves(electionRecord);
    apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Contests' });
    userEvent.click(screen.getByRole('button', { name: 'Add Contest' }));

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

    const yesInput = screen.getByLabelText('First Option Label');
    const noInput = screen.getByLabelText('Second Option Label');
    userEvent.clear(yesInput);
    userEvent.type(yesInput, newContest.yesOption.label);
    userEvent.clear(noInput);
    userEvent.type(noInput, newContest.noOption.label);

    await within(descriptionEditor).findByText(newContest.description);
    const descriptionHtml = `<p>${newContest.description}</p>`;

    // Save contest
    const electionWithNewContestRecord: ElectionRecord = {
      ...electionRecord,
      election: {
        ...election,
        contests: [
          ...election.contests,
          {
            ...newContest,
            description: descriptionHtml,
          },
        ],
      },
    };
    apiMock.updateElection
      .expectCallWith({
        electionId,
        election: electionWithNewContestRecord.election,
      })
      .resolves();
    apiMock.getElection
      .expectCallWith({ electionId, user })
      .resolves(electionWithNewContestRecord);
    const saveButton = screen.getByRole('button', { name: 'Save' });
    userEvent.click(saveButton);

    await screen.findByRole('heading', { name: 'Contests' });
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(
      electionWithNewContestRecord.election.contests.length + 1
    );
    const lastRow = rows.at(-1)!;
    expect(
      within(lastRow)
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    ).toEqual([
      newContest.title,
      'Ballot Measure',
      election.districts[0].name,
      'Edit',
    ]);
  });

  test('editing a ballot measure', async () => {
    const electionRecord = generalElectionRecord(user.orgId);
    const { election } = electionRecord;
    const electionId = election.id;
    const savedContest = election.contests.find(
      (contest): contest is YesNoContest => contest.type === 'yesno'
    )!;
    const savedDistrict = election.districts.find(
      (district) => district.id === savedContest.districtId
    )!;
    const changedDistrict = election.districts.find(
      (district) => district.id !== savedContest.districtId
    )!;
    const changedContest: YesNoContest = {
      ...savedContest,
      title: 'Changed Ballot Measure Title',
      districtId: changedDistrict.id,
      description: 'Changed Ballot Measure Description',
      yesOption: {
        ...savedContest.yesOption,
        label: 'Yea',
      },
      noOption: {
        ...savedContest.noOption,
        label: 'Nay',
      },
    };

    apiMock.getUser.expectRepeatedCallsWith().resolves(user);
    apiMock.getElection
      .expectCallWith({ electionId, user })
      .resolves(electionRecord);
    apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Contests' });
    const savedContestRow = screen.getByText(savedContest.title).closest('tr')!;
    within(savedContestRow).getByText(savedDistrict.name);
    within(savedContestRow).getByText('Ballot Measure');
    userEvent.click(
      within(savedContestRow).getByRole('button', { name: 'Edit' })
    );

    await screen.findByRole('heading', { name: 'Edit Contest' });

    // Change title
    const titleInput = screen.getByLabelText('Title');
    expect(titleInput).toHaveValue(savedContest.title);
    userEvent.clear(titleInput);
    userEvent.type(titleInput, changedContest.title);

    // Change district
    userEvent.click(screen.getByText(savedDistrict.name));
    userEvent.click(screen.getByText(changedDistrict.name));

    // Change description
    const descriptionEditor = within(
      screen.getByText('Description').parentElement!
    ).getByTestId('rich-text-editor');
    within(descriptionEditor).getByText(savedContest.description);
    // userEvent.type doesn't work for updating the content for some reason
    fireEvent.change(descriptionEditor.querySelector('.tiptap p')!, {
      target: { textContent: changedContest.description },
    });
    await within(descriptionEditor).findByText(changedContest.description);
    const descriptionHtml = `<p>${changedContest.description}</p>`;

    // Change yes and no labels
    const yesInput = screen.getByLabelText('First Option Label');
    expect(yesInput).toHaveValue(savedContest.yesOption.label);
    userEvent.clear(yesInput);
    userEvent.type(yesInput, changedContest.yesOption.label);

    const noInput = screen.getByLabelText('Second Option Label');
    expect(noInput).toHaveValue(savedContest.noOption.label);
    userEvent.clear(noInput);
    userEvent.type(noInput, changedContest.noOption.label);

    // Save contest
    const electionWithChangedContestRecord: ElectionRecord = {
      ...electionRecord,
      election: {
        ...election,
        contests: election.contests.map((contest) =>
          contest.id === savedContest.id
            ? { ...changedContest, description: descriptionHtml }
            : contest
        ),
      },
    };
    apiMock.updateElection
      .expectCallWith({
        electionId,
        election: electionWithChangedContestRecord.election,
      })
      .resolves();
    apiMock.getElection
      .expectCallWith({ electionId, user })
      .resolves(electionWithChangedContestRecord);
    const saveButton = screen.getByRole('button', { name: 'Save' });
    userEvent.click(saveButton);

    await screen.findByRole('heading', { name: 'Contests' });
    const changedContestRow = screen
      .getByText(changedContest.title)
      .closest('tr')!;
    within(changedContestRow).getByText(changedDistrict.name);
    within(changedContestRow).getByText('Ballot Measure');
  });

  test('reordering contests', async () => {
    const electionRecord = generalElectionRecord(user.orgId);
    const { election } = electionRecord;
    const electionId = election.id;
    // Mock needed for react-flip-toolkit
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
    }));

    apiMock.getUser.expectRepeatedCallsWith().resolves(user);
    apiMock.getElection
      .expectCallWith({ electionId, user })
      .resolves(electionRecord);
    apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Contests' });

    function getRowOrder() {
      return screen
        .getAllByRole('row')
        .slice(1) // Skip header row
        .map((row) => row.childNodes[0].textContent);
    }

    const originalOrder = getRowOrder();

    userEvent.click(screen.getByRole('button', { name: 'Reorder Contests' }));
    expect(screen.getByRole('button', { name: 'Add Contest' })).toBeDisabled();

    userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(getRowOrder()).toEqual(originalOrder);

    userEvent.click(screen.getByRole('button', { name: 'Reorder Contests' }));

    const [contest1Title, contest2Title, contest3Title] = originalOrder;
    const contest1Row = screen.getByText(contest1Title!).closest('tr')!;
    expect(
      within(contest1Row).getByRole('button', { name: 'Move Up' })
    ).toBeDisabled();
    userEvent.click(
      within(contest1Row).getByRole('button', { name: 'Move Down' })
    );

    const contest3Row = screen.getByText(contest3Title!).closest('tr')!;
    userEvent.click(
      within(contest3Row).getByRole('button', { name: 'Move Up' })
    );

    const lastContestRow = screen.getAllByRole('row').at(-1)!;
    expect(
      within(lastContestRow).getByRole('button', { name: 'Move Down' })
    ).toBeDisabled();

    const newOrder = [
      contest2Title,
      contest3Title,
      contest1Title,
      ...originalOrder.slice(3),
    ];
    expect(getRowOrder()).toEqual(newOrder);

    const reorderedElectionRecord: ElectionRecord = {
      ...electionRecord,
      election: {
        ...election,
        contests: [
          election.contests[1],
          election.contests[2],
          election.contests[0],
          ...election.contests.slice(3),
        ],
      },
    };
    apiMock.updateElection
      .expectCallWith({
        electionId,
        election: reorderedElectionRecord.election,
      })
      .resolves();
    apiMock.getElection
      .expectCallWith({ electionId, user })
      .resolves(reorderedElectionRecord);
    userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByRole('button', { name: 'Reorder Contests' });
    expect(getRowOrder()).toEqual(newOrder);
  });

  test('changing contests is disabled when ballots are finalized', async () => {
    const electionRecord = generalElectionRecord(user.orgId);
    const { election } = electionRecord;
    const electionId = election.id;
    // Mock needed for react-flip-toolkit
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
    }));

    apiMock.getUser.expectRepeatedCallsWith().resolves(user);
    apiMock.getElection
      .expectCallWith({ electionId, user })
      .resolves(electionRecord);
    apiMock.getBallotsFinalizedAt
      .expectCallWith({ electionId })
      .resolves(new Date());
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Contests' });

    expect(
      screen.getByRole('button', { name: 'Reorder Contests' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add Contest' })).toBeDisabled();

    const savedContest = election.contests.find(
      (contest): contest is CandidateContest => contest.type === 'candidate'
    )!;
    const savedContestRow = screen.getByText(savedContest.title).closest('tr')!;
    expect(
      within(savedContestRow).getByRole('button', { name: 'Edit' })
    ).toBeDisabled();
  });
});

describe('Parties tab', () => {
  const election = readElectionGeneral();
  const electionId = election.id;

  beforeEach(() => {
    apiMock.getUser.expectCallWith().resolves(user);
    apiMock.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  });

  test('adding a party', async () => {
    const newParty: Party = {
      id: idFactory.next() as PartyId,
      name: 'New Party',
      fullName: 'New Party Full Name',
      abbrev: 'NP',
    };

    apiMock.getElection
      .expectCallWith({ electionId, user })
      .resolves(electionWithNoContestsRecord);
    apiMock.listParties.expectCallWith({ electionId }).resolves([]);
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Contests' });
    userEvent.click(screen.getByRole('tab', { name: 'Parties' }));
    await screen.findByText(
      "You haven't added any parties to this election yet."
    );

    userEvent.click(screen.getByRole('button', { name: 'Add Party' }));
    await screen.findByRole('heading', { name: 'Add Party' });

    userEvent.type(screen.getByLabelText('Full Name'), newParty.fullName);
    userEvent.type(screen.getByLabelText('Short Name'), newParty.name);
    userEvent.type(screen.getByLabelText('Abbreviation'), newParty.abbrev);

    apiMock.createParty.expectCallWith({ electionId, newParty }).resolves();
    apiMock.listParties.expectCallWith({ electionId }).resolves([newParty]);
    apiMock.getElection
      .expectCallWith({ electionId, user })
      .resolves(electionWithNoContestsRecord);
    userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByRole('heading', { name: 'Contests' });
    screen.getByRole('tab', { name: 'Parties', selected: true });
    expect(
      screen.getAllByRole('columnheader').map((th) => th.textContent)
    ).toEqual(['Name', 'Abbreviation', '']);
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(
      within(rows[1])
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    ).toEqual([newParty.fullName, newParty.abbrev, 'Edit']);
  });

  test('editing a party', async () => {
    const savedParty = election.parties[0];
    const updatedParty: Party = {
      ...savedParty,
      name: 'Updated Party',
      fullName: 'Updated Party Full Name',
      abbrev: 'UP',
    };

    apiMock.getElection
      .expectCallWith({ electionId, user })
      .resolves(electionWithNoContestsRecord);
    apiMock.listParties
      .expectCallWith({ electionId })
      .resolves(election.parties);
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Contests' });
    userEvent.click(screen.getByRole('tab', { name: 'Parties' }));
    const savedPartyRow = (
      await screen.findByText(savedParty.fullName)
    ).closest('tr')!;
    userEvent.click(
      within(savedPartyRow).getByRole('button', { name: 'Edit' })
    );
    await screen.findByRole('heading', { name: 'Edit Party' });

    const fullNameInput = screen.getByLabelText('Full Name');
    expect(fullNameInput).toHaveValue(savedParty.fullName);
    userEvent.clear(fullNameInput);
    userEvent.type(fullNameInput, updatedParty.fullName);

    const shortNameInput = screen.getByLabelText('Short Name');
    expect(shortNameInput).toHaveValue(savedParty.name);
    userEvent.clear(shortNameInput);
    userEvent.type(shortNameInput, updatedParty.name);

    const abbrevInput = screen.getByLabelText('Abbreviation');
    expect(abbrevInput).toHaveValue(savedParty.abbrev);
    userEvent.clear(abbrevInput);
    userEvent.type(abbrevInput, updatedParty.abbrev);

    apiMock.updateParty.expectCallWith({ electionId, updatedParty }).resolves();
    apiMock.listParties
      .expectCallWith({ electionId })
      .resolves([updatedParty, ...election.parties.slice(1)]);
    apiMock.getElection
      .expectCallWith({ electionId, user })
      .resolves(electionWithNoContestsRecord);
    userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByRole('heading', { name: 'Contests' });
    const updatedPartyRow = screen
      .getByText(updatedParty.fullName)
      .closest('tr')!;
    expect(
      within(updatedPartyRow)
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    ).toEqual([updatedParty.fullName, updatedParty.abbrev, 'Edit']);
  });

  test('deleting a party', async () => {
    const [savedParty] = election.parties;

    apiMock.getElection
      .expectCallWith({ electionId, user })
      .resolves(electionWithNoContestsRecord);
    apiMock.listParties
      .expectCallWith({ electionId })
      .resolves(election.parties);
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Contests' });
    userEvent.click(screen.getByRole('tab', { name: 'Parties' }));
    const savedPartyRow = (
      await screen.findByText(savedParty.fullName)
    ).closest('tr')!;
    userEvent.click(
      within(savedPartyRow).getByRole('button', { name: 'Edit' })
    );
    await screen.findByRole('heading', { name: 'Edit Party' });

    apiMock.deleteParty
      .expectCallWith({ electionId, partyId: savedParty.id })
      .resolves();
    apiMock.listParties
      .expectCallWith({ electionId })
      .resolves(election.parties.slice(1));
    apiMock.getElection
      .expectCallWith({ electionId, user })
      .resolves(electionWithNoContestsRecord);
    // Initiate the deletion
    userEvent.click(screen.getByRole('button', { name: 'Delete Party' }));
    // Confirm the deletion in the modal
    userEvent.click(screen.getByRole('button', { name: 'Delete Party' }));

    await screen.findByRole('heading', { name: 'Contests' });
    expect(screen.getAllByRole('row')).toHaveLength(election.parties.length);
    expect(screen.queryByText(savedParty.fullName)).not.toBeInTheDocument();
  });

  test('editing or adding a party is disabled when ballots are finalized', async () => {
    apiMock.getBallotsFinalizedAt.reset();
    apiMock.getBallotsFinalizedAt
      .expectCallWith({ electionId })
      .resolves(new Date());
    apiMock.getElection
      .expectCallWith({ electionId, user })
      .resolves(electionWithNoContestsRecord);
    apiMock.listParties
      .expectCallWith({ electionId })
      .resolves(election.parties);
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Contests' });
    userEvent.click(screen.getByRole('tab', { name: 'Parties' }));
    await screen.findByText(election.parties[0].fullName);
    expect(screen.getAllByRole('button', { name: 'Edit' })[0]).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add Party' })).toBeDisabled();
  });

  test('cancelling', async () => {
    apiMock.getElection
      .expectCallWith({ electionId, user })
      .resolves(electionWithNoContestsRecord);
    apiMock.listParties
      .expectCallWith({ electionId })
      .resolves(election.parties);
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Contests' });
    userEvent.click(screen.getByRole('tab', { name: 'Parties' }));
    userEvent.click(
      (await screen.findAllByRole('button', { name: 'Edit' }))[0]
    );

    await screen.findByRole('heading', { name: 'Edit Party' });
    userEvent.click(screen.getByRole('button', { name: 'Delete Party' }));
    await screen.findByRole('heading', { name: 'Delete Party' });
    // Cancel in confirm delete modal
    userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Delete Party' })
      ).not.toBeInTheDocument()
    );

    // Cancel edit party
    userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await screen.findByRole('heading', { name: 'Contests' });
    screen.getByRole('tab', { name: 'Parties', selected: true });
  });
});
