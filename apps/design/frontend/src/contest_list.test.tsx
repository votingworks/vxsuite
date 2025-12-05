import { Contest, District } from '@votingworks/types';
import { afterEach, expect, test, vi } from 'vitest';
import { createMemoryHistory, MemoryHistory } from 'history';
import { Router, Route } from 'react-router-dom';
import { assert } from '@votingworks/basics';
import userEvent from '@testing-library/user-event';
import {
  createMockApiClient,
  MockApiClient,
  provideApi,
} from '../test/api_helpers';
import { ContestList, ContestListProps, ReorderParams } from './contest_list';
import { render, screen, within } from '../test/react_testing_library';
import { routes } from './routes';

const district1: District = { id: 'district1', name: 'District 1' };
const district2: District = { id: 'district2', name: 'District 2' };

const candidateContest1: Contest = {
  id: 'candidateContest1',
  title: 'Candidate Contest 1',
  districtId: district1.id,
  type: 'candidate',
};
const candidateContest2: Contest = {
  id: 'candidateContest2',
  title: 'Candidate Contest 2',
  districtId: district2.id,
  type: 'candidate',
};

const yesNoContest1: Contest = {
  id: 'yesNoContest1',
  title: 'YesNo Contest 1',
  districtId: district1.id,
  type: 'yesno',
};
const yesNoContest2: Contest = {
  id: 'yesNoContest2',
  title: 'YesNo Contest Contest 2',
  districtId: district2.id,
  type: 'yesno',
};

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
    reorder: vi.fn(),
    reordering: false,
    yesNoContests,
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

test('navigates on select', async () => {
  mockApi = newMockApi({ districts: [district1, district2] });
  const candidateContests = [candidateContest1, candidateContest2];
  const yesNoContests = [yesNoContest1, yesNoContest2];
  const history = newHistory();

  renderList(mockApi, history, {
    candidateContests,
    reorder: vi.fn(),
    reordering: false,
    yesNoContests,
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
    reorder: vi.fn(),
    reordering: false,
    yesNoContests: [],
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
    reorder: vi.fn(),
    reordering: false,
    yesNoContests,
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
    reorder,
    reordering: false,
    yesNoContests: [],
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
    reorder,
    reordering: true,
    yesNoContests,
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

function getHeading(name: string) {
  return screen.getByRole('heading', { name });
}

function getOption(
  contest: Contest,
  district: District,
  opts: { selected?: boolean } = {}
) {
  return screen.getByRole('option', {
    ...opts,
    name: `${district.name} ${contest.title}`,
  });
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

function newMockApi(p: { districts: District[] }) {
  mockApi = createMockApiClient();
  mockApi.listDistricts.expectCallWith({ electionId }).resolves(p.districts);

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
