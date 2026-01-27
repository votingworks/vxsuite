import {
  AnyContest,
  Contest,
  ContestSectionHeader,
  District,
  Party,
} from '@votingworks/types';
import { afterEach, expect, test, vi } from 'vitest';
import { createMemoryHistory, MemoryHistory } from 'history';
import { Router, Route } from 'react-router-dom';
import { assert, typedAs } from '@votingworks/basics';
import userEvent from '@testing-library/user-event';
import {
  createMockApiClient,
  MockApiClient,
  provideApi,
} from '../test/api_helpers';
import { ContestList, ContestListProps, ReorderParams } from './contest_list';
import { render, screen, waitFor, within } from '../test/react_testing_library';
import { routes } from './routes';

const district1: District = { id: 'district1', name: 'District 1' };
const district2: District = { id: 'district2', name: 'District 2' };

const party1: Party = {
  id: 'party-1',
  abbrev: '1',
  fullName: 'Party 1',
  name: 'P1',
};

const party2: Party = {
  id: 'party-2',
  abbrev: '2',
  fullName: 'Party 2',
  name: 'P2',
};

const candidateContest1 = typedAs<Contest>({
  id: 'candidateContest1',
  title: 'Candidate Contest 1',
  districtId: district1.id,
  type: 'candidate',
}) as AnyContest;

const candidateContest2 = typedAs<Contest>({
  id: 'candidateContest2',
  title: 'Candidate Contest 2',
  districtId: district2.id,
  type: 'candidate',
}) as AnyContest;

const yesNoContest1 = typedAs<Contest>({
  id: 'yesNoContest1',
  title: 'YesNo Contest 1',
  districtId: district1.id,
  type: 'yesno',
}) as AnyContest;

const yesNoContest2 = typedAs<Contest>({
  id: 'yesNoContest2',
  title: 'YesNo Contest Contest 2',
  districtId: district2.id,
  type: 'yesno',
}) as AnyContest;

const electionId = 'election1';
const contestRoutes = routes.election(electionId).contests;
const contestParamRoutes = routes.election(':electionId').contests;
let mockApi: MockApiClient | undefined;

afterEach(() => {
  mockApi?.assertComplete();
});

test('renders labelled candidate and ballot measure sublists', async () => {
  mockApi = newMockApi({ districts: [district1, district2] });
  const candidateContests = [candidateContest1, candidateContest2];
  const yesNoContests = [yesNoContest1, yesNoContest2];

  renderList(mockApi, newHistory(), {
    candidateContests,
    yesNoContests,
    reorder: vi.fn(),
    reordering: false,
  });

  await screen.findAllByText(district1.name);
  mockApi.assertComplete();

  const list = screen.getByRole('listbox').children;
  expect(list).toHaveLength(4);

  expect(list.item(0)).toEqual(getHeading('Candidate Contests'));
  expect(getSublist(list.item(1))).toEqual([
    getOption(candidateContest1, district1),
    getOption(candidateContest2, district2),
  ]);

  expect(list.item(2)).toEqual(getHeading('Ballot Measures'));
  expect(getSublist(list.item(3))).toEqual([
    getOption(yesNoContest1, district1),
    getOption(yesNoContest2, district2),
  ]);
});

test('renders primary election contest parties, when available', async () => {
  mockApi = newMockApi({
    districts: [district1, district2],
    parties: [party1, party2],
  });

  const party1Contest = withParty(candidateContest1, party1);
  const party2Contest = withParty(candidateContest2, party2);

  const candidateContests = [party1Contest, party2Contest];
  const yesNoContests = [yesNoContest1, yesNoContest2];

  renderList(mockApi, newHistory(), {
    candidateContests,
    yesNoContests,
    reorder: vi.fn(),
    reordering: false,
  });

  await screen.findAllByText(district1.name);
  mockApi.assertComplete();

  const list = screen.getByRole('listbox').children;
  expect(list).toHaveLength(4);

  expect(list.item(0)).toEqual(getHeading('Candidate Contests'));
  expect(getSublist(list.item(1))).toEqual([
    getOption(party1Contest, district1, { party: party1 }),
    getOption(party2Contest, district2, { party: party2 }),
  ]);

  expect(list.item(2)).toEqual(getHeading('Ballot Measures'));
  expect(getSublist(list.item(3))).toEqual([
    getOption(yesNoContest1, district1),
    getOption(yesNoContest2, district2),
  ]);
});

test('navigates on select', async () => {
  mockApi = newMockApi({ districts: [district1, district2] });
  const candidateContests = [candidateContest1, candidateContest2];
  const yesNoContests = [yesNoContest1, yesNoContest2];
  const history = newHistory();

  renderList(mockApi, history, {
    candidateContests,
    yesNoContests,
    reorder: vi.fn(),
    reordering: false,
  });

  await screen.findAllByText(district1.name);
  mockApi.assertComplete();

  expect(
    screen.queryByRole('option', { selected: true })
  ).not.toBeInTheDocument();

  userEvent.click(getOption(yesNoContest2, district2));
  getOption(yesNoContest2, district2, { selected: true });
  expect(history.location.pathname).toEqual(
    contestRoutes.view(yesNoContest2.id).path
  );

  userEvent.click(getOption(candidateContest1, district1));
  getOption(candidateContest1, district1, { selected: true });
  getOption(yesNoContest2, district2, { selected: false });
  expect(history.location.pathname).toEqual(
    contestRoutes.view(candidateContest1.id).path
  );
});

test('omits ballot measure section if empty', async () => {
  mockApi = newMockApi({ districts: [district2, district1] });
  const candidateContests = [candidateContest1, candidateContest2];

  renderList(mockApi, newHistory(), {
    candidateContests,
    yesNoContests: [],
    reorder: vi.fn(),
    reordering: false,
  });

  await screen.findAllByText(district1.name);
  mockApi.assertComplete();

  const list = screen.getByRole('listbox').children;
  expect(list).toHaveLength(2);

  expect(list.item(0)).toEqual(getHeading('Candidate Contests'));
  expect(getSublist(list.item(1))).toEqual([
    getOption(candidateContest1, district1),
    getOption(candidateContest2, district2),
  ]);
});

test('omits candidate section if empty', async () => {
  mockApi = newMockApi({ districts: [district1, district2] });
  const yesNoContests = [yesNoContest2, yesNoContest1];

  renderList(mockApi, newHistory(), {
    candidateContests: [],
    yesNoContests,
    reorder: vi.fn(),
    reordering: false,
  });

  await screen.findAllByText(district1.name);
  mockApi.assertComplete();

  const list = screen.getByRole('listbox').children;
  expect(list).toHaveLength(2);

  expect(list.item(0)).toEqual(getHeading('Ballot Measures'));
  expect(getSublist(list.item(1))).toEqual([
    getOption(yesNoContest2, district2),
    getOption(yesNoContest1, district1),
  ]);
});

test('omits reordering when not enabled', async () => {
  mockApi = newMockApi({ districts: [district2] });
  const candidateContests = [candidateContest2];

  const reorder = vi.fn();

  renderList(mockApi, newHistory(), {
    candidateContests,
    yesNoContests: [],
    reorder,
    reordering: false,
  });

  await screen.findAllByText(district2.name);
  mockApi.assertComplete();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(reorder).not.toHaveBeenCalled();
});

test('supports reordering', async () => {
  mockApi = newMockApi({ districts: [district1, district2] });
  const candidateContests = [candidateContest1, candidateContest2];
  const yesNoContests = [yesNoContest1, yesNoContest2];

  const reorder = vi.fn();

  renderList(mockApi, newHistory(), {
    candidateContests,
    yesNoContests,
    reorder,
    reordering: true,
  });

  await screen.findAllByText(district2.name);
  mockApi.assertComplete();

  expect(
    screen.getButton(`Move Up: ${candidateContest1.title}`)
  ).toBeDisabled();
  expect(screen.getButton(`Move Up: ${yesNoContest1.title}`)).toBeDisabled();

  expect(
    screen.getButton(`Move Down: ${candidateContest2.title}`)
  ).toBeDisabled();
  expect(screen.getButton(`Move Down: ${yesNoContest2.title}`)).toBeDisabled();

  userEvent.click(screen.getButton(`Move Up: ${yesNoContest2.title}`));
  userEvent.click(screen.getButton(`Move Down: ${candidateContest1.title}`));

  expect(reorder.mock.calls).toEqual<Array<[ReorderParams]>>([
    [{ id: yesNoContest2.id, direction: -1 }],
    [{ id: candidateContest1.id, direction: 1 }],
  ]);

  // List ordering should be unchanged, as it's controlled by the parent:

  const list = screen.getByRole('listbox').children;
  expect(list).toHaveLength(4);

  expect(list.item(0)).toEqual(getHeading('Candidate Contests'));
  expect(getSublist(list.item(1))).toEqual([
    getOption(candidateContest1, district1),
    getOption(candidateContest2, district2),
  ]);

  expect(list.item(2)).toEqual(getHeading('Ballot Measures'));
  expect(getSublist(list.item(3))).toEqual([
    getOption(yesNoContest1, district1),
    getOption(yesNoContest2, district2),
  ]);
});

test('editing contest section headers', async () => {
  mockApi = newMockApi({ districts: [district1, district2] });
  mockApi.getStateFeatures.reset();
  mockApi.getStateFeatures
    .expectCallWith({ electionId })
    .resolves({ CONTEST_SECTION_HEADERS: true });

  const candidateContests = [candidateContest1, candidateContest2];
  const yesNoContests = [yesNoContest1, yesNoContest2];

  renderList(mockApi, newHistory(), {
    candidateContests,
    yesNoContests,
    reorder: vi.fn(),
    reordering: false,
  });

  await screen.findAllByText(district1.name);
  const candidateContestListHeader = await screen.findByRole('heading', {
    name: /Candidate Contests/,
  });
  mockApi.getBallotsFinalizedAt.expectCallWith({ electionId }).resolves(null);
  userEvent.click(
    within(candidateContestListHeader).getButton('Add Ballot Header')
  );

  let modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', {
    name: 'Edit Ballot Header - Candidate Contests',
  });
  let titleInput = within(modal).getByLabelText('Title');
  let descriptionEditor = within(
    screen.getByText('Description').parentElement!
  ).getByTestId('rich-text-editor');
  const saveButton = within(modal).getByRole('button', { name: 'Save' });
  const deleteButton = within(modal).getByRole('button', { name: 'Delete' });
  expect(saveButton).toBeDisabled();
  expect(deleteButton).toBeDisabled();
  expect(titleInput).toHaveValue('');
  expect(descriptionEditor).toHaveTextContent('');

  const expectedCandidateHeader: ContestSectionHeader = {
    title: 'New Candidate Header Title',
    description: '<p>New Candidate Header Description</p>',
  };
  userEvent.type(titleInput, expectedCandidateHeader.title);
  expect(saveButton).toBeEnabled();
  userEvent.type(
    descriptionEditor.querySelector('.tiptap p')!,
    'New Candidate Header Description'
  );
  await within(descriptionEditor).findByText(
    'New Candidate Header Description'
  );

  mockApi.updateContestSectionHeader
    .expectCallWith({
      electionId,
      contestType: 'candidate',
      updatedHeader: expectedCandidateHeader,
    })
    .resolves();
  mockApi.getContestSectionHeaders.expectCallWith({ electionId }).resolves({
    candidate: expectedCandidateHeader,
    yesno: undefined,
  });
  userEvent.click(saveButton);
  await waitFor(() => {
    expect(modal).not.toBeInTheDocument();
  });

  const editButton = within(candidateContestListHeader).getButton(
    expectedCandidateHeader.title
  );
  userEvent.click(editButton);

  modal = await screen.findByRole('alertdialog');
  titleInput = within(modal).getByLabelText('Title');
  expect(titleInput).toHaveValue(expectedCandidateHeader.title);
  descriptionEditor = within(
    screen.getByText('Description').parentElement!
  ).getByTestId('rich-text-editor');
  expect(descriptionEditor).toHaveTextContent(
    'New Candidate Header Description'
  );

  userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => {
    expect(modal).not.toBeInTheDocument();
  });
  userEvent.click(editButton);
  modal = await screen.findByRole('alertdialog');

  mockApi.updateContestSectionHeader
    .expectCallWith({
      electionId,
      contestType: 'candidate',
      updatedHeader: undefined,
    })
    .resolves();
  mockApi.getContestSectionHeaders.expectCallWith({ electionId }).resolves({
    candidate: undefined,
    yesno: undefined,
  });
  userEvent.click(within(modal).getByRole('button', { name: 'Delete' }));
  await waitFor(() => {
    expect(modal).not.toBeInTheDocument();
  });
  within(candidateContestListHeader).getButton('Add Ballot Header');

  const ballotMeasureContestListHeader = await screen.findByRole('heading', {
    name: /Ballot Measures/,
  });
  within(ballotMeasureContestListHeader).getButton('Add Ballot Header');
  userEvent.click(
    within(ballotMeasureContestListHeader).getButton('Add Ballot Header')
  );
  modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', {
    name: 'Edit Ballot Header - Ballot Measures',
  });
  userEvent.type(
    within(modal).getByLabelText('Title'),
    'New Ballot Measure Header Title'
  );
  const expectedBallotMeasureHeader: ContestSectionHeader = {
    title: 'New Ballot Measure Header Title',
    description: undefined,
  };
  mockApi.updateContestSectionHeader
    .expectCallWith({
      electionId,
      contestType: 'yesno',
      updatedHeader: expectedBallotMeasureHeader,
    })
    .resolves();
  mockApi.getContestSectionHeaders.expectCallWith({ electionId }).resolves({
    candidate: undefined,
    yesno: expectedBallotMeasureHeader,
  });
  userEvent.click(within(modal).getByRole('button', { name: 'Save' }));
  await waitFor(() => {
    expect(modal).not.toBeInTheDocument();
  });
  within(ballotMeasureContestListHeader).getButton(
    expectedBallotMeasureHeader.title
  );
});

test('disables editing contest section headers when ballots are finalized', async () => {
  mockApi = newMockApi({ districts: [district1, district2] });
  mockApi.getStateFeatures.reset();
  mockApi.getStateFeatures
    .expectCallWith({ electionId })
    .resolves({ CONTEST_SECTION_HEADERS: true });
  const candidateContests = [candidateContest1, candidateContest2];
  const yesNoContests = [yesNoContest1, yesNoContest2];
  renderList(mockApi, newHistory(), {
    candidateContests,
    yesNoContests,
    reorder: vi.fn(),
    reordering: false,
  });

  await screen.findAllByText(district1.name);
  const candidateContestListHeader = await screen.findByRole('heading', {
    name: /Candidate Contests/,
  });
  mockApi.getBallotsFinalizedAt
    .expectCallWith({ electionId })
    .resolves(new Date());
  userEvent.click(
    within(candidateContestListHeader).getButton('Add Ballot Header')
  );

  const modal = await screen.findByRole('alertdialog');
  expect(within(modal).getByLabelText('Title')).toBeDisabled();
  expect(
    within(modal).getByTestId('rich-text-editor').querySelector('.tiptap')!
  ).toHaveAttribute('contenteditable', 'false');
  expect(within(modal).getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(within(modal).getByRole('button', { name: 'Delete' })).toBeDisabled();
});

function getHeading(name: string) {
  return screen.getByRole('heading', { name });
}

function getOption(
  contest: AnyContest,
  district: District,
  opts: { party?: Party; selected?: boolean } = {}
) {
  const name: string[] = [];
  if (opts.party) name.push(opts.party.fullName);
  name.push(district.name, contest.title);

  return screen.getByRole('option', { ...opts, name: name.join(' ') });
}

function getSublist(container: Element | null) {
  assert(container instanceof HTMLElement);
  return within(container).getAllByRole('option');
}

function newHistory(initialRoute?: string) {
  return createMemoryHistory({
    initialEntries: [initialRoute || contestRoutes.root.path],
  });
}

function newMockApi(p: { districts: District[]; parties?: Party[] }) {
  mockApi = createMockApiClient();
  mockApi.listDistricts.expectCallWith({ electionId }).resolves(p.districts);
  mockApi.listParties.expectCallWith({ electionId }).resolves(p.parties || []);
  mockApi.getContestSectionHeaders
    .expectCallWith({ electionId })
    .resolves({ candidate: undefined, yesno: undefined });
  mockApi.getStateFeatures.expectCallWith({ electionId }).resolves({});

  return mockApi;
}

function renderList(
  api: MockApiClient,
  history: MemoryHistory,
  props: ContestListProps
) {
  return render(
    provideApi(
      api,
      <Router history={history}>
        <Route exact path={contestParamRoutes.view(':contestId').path}>
          <ContestList {...props} />
        </Route>
        <Route exact path={contestParamRoutes.root.path}>
          <ContestList {...props} />
        </Route>
      </Router>
    )
  );
}

function withParty(contest: AnyContest, party: Party) {
  assert(contest.type === 'candidate');
  return { ...contest, partyId: party.id };
}
