import { createMemoryHistory } from 'history';
import userEvent from '@testing-library/user-event';
import type { ElectionRecord } from '@votingworks/design-backend';
import { CandidateContest, ElectionId, YesNoContest } from '@votingworks/types';
import { assert } from '@votingworks/basics';
import {
  MockApiClient,
  createMockApiClient,
  provideApi,
} from '../test/api_helpers';
import { generalElectionRecord, primaryElectionRecord } from '../test/fixtures';
import { render, screen, waitFor, within } from '../test/react_testing_library';
import { withRoute } from '../test/routing_helpers';
import { ContestsScreen } from './contests_screen';
import { routes } from './routes';
import { makeIdFactory } from '../test/id_helpers';

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

const electionWithNoContestsRecord: ElectionRecord = {
  ...generalElectionRecord,
  election: {
    ...generalElectionRecord.election,
    contests: [],
  },
};

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
          partyIds: [election.parties[0].id],
        },
        {
          id: idFactory.next(),
          name: 'New Candidate 2',
          partyIds: [election.parties[1].id],
        },
        {
          id: idFactory.next(),
          name: 'New Candidate 3',
        },
      ],
    };

    apiMock.getElection
      .expectCallWith({ electionId })
      .resolves(electionWithNoContestsRecord);
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
      screen.getByRole('columnheader', { name: 'Name' });
      screen.getByRole('columnheader', { name: 'Party' });
      const row = screen.getAllByRole('row')[i + 1];

      // Set name
      userEvent.type(
        within(row).getByLabelText(`Candidate ${i + 1} Name`),
        candidate.name
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
      .expectCallWith({ electionId })
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
    const { election } = primaryElectionRecord;
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
          partyIds: undefined,
        },
        ...savedContest.candidates.slice(2),
      ],
    };

    apiMock.getElection
      .expectCallWith({ electionId })
      .resolves(primaryElectionRecord);
    renderScreen(electionId);

    await screen.findByRole('heading', { name: 'Contests' });
    screen.getByRole('tab', { name: 'Contests', selected: true });
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
      expect(within(row).getByLabelText(`Candidate ${i + 1} Name`)).toHaveValue(
        candidate.name
      );
      const party = election.parties.find(
        (p) => p.id === candidate.partyIds?.[0]
      )!;
      within(row).getByText(party.name);
    }

    // Edit candidate 2
    const candidateNameInput = within(candidateRows[2]).getByLabelText(
      'Candidate 2 Name'
    );
    userEvent.clear(candidateNameInput);
    userEvent.type(candidateNameInput, changedContest.candidates[0].name);
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
      ...generalElectionRecord,
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
      .expectCallWith({ electionId })
      .resolves(electionWithChangedContestRecord);
    const saveButton = screen.getByRole('button', { name: 'Save' });
    userEvent.click(saveButton);

    await screen.findByRole('heading', { name: 'Contests' });
    screen.getByRole('tab', { name: 'Contests', selected: true });

    const changedContestRow = screen
      .getByText(changedContest.title)
      .closest('tr')!;
    within(changedContestRow).getByText('Candidate Contest');
    within(changedContestRow).getByText(changedDistrict.name);
    within(changedContestRow).getByText(changedParty.name);
  });

  test('adding a ballot measure', async () => {
    const { election } = generalElectionRecord;
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

    apiMock.getElection
      .expectCallWith({ electionId })
      .resolves(generalElectionRecord);
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
    userEvent.type(
      screen.getByLabelText('Description'),
      newContest.description
    );

    // Save contest
    const electionWithNewContestRecord: ElectionRecord = {
      ...generalElectionRecord,
      election: {
        ...election,
        contests: [...election.contests, newContest],
      },
    };
    apiMock.updateElection
      .expectCallWith({
        electionId,
        election: electionWithNewContestRecord.election,
      })
      .resolves();
    apiMock.getElection
      .expectCallWith({ electionId })
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
    const { election } = generalElectionRecord;
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
        label: 'Yes',
      },
      noOption: {
        ...savedContest.noOption,
        label: 'No',
      },
    };

    apiMock.getElection
      .expectCallWith({ electionId })
      .resolves(generalElectionRecord);
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
    const descriptionInput = screen.getByLabelText('Description');
    expect(descriptionInput).toHaveValue(savedContest.description);
    userEvent.clear(descriptionInput);
    userEvent.type(descriptionInput, changedContest.description);

    // Save contest
    const electionWithChangedContestRecord: ElectionRecord = {
      ...generalElectionRecord,
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
      .expectCallWith({ electionId })
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
    const { election } = generalElectionRecord;
    const electionId = election.id;
    // Mock needed for react-flip-toolkit
    window.matchMedia = jest.fn().mockImplementation(() => ({
      matches: false,
    }));

    apiMock.getElection
      .expectCallWith({ electionId })
      .resolves(generalElectionRecord);
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
      ...generalElectionRecord,
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
      .expectCallWith({ electionId })
      .resolves(reorderedElectionRecord);
    userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByRole('button', { name: 'Reorder Contests' });
    expect(getRowOrder()).toEqual(newOrder);
  });
});
