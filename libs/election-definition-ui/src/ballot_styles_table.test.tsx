import { afterEach, beforeEach, expect, test } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { DateWithoutTime } from '@votingworks/basics';
import type { ElectionInfo } from '@votingworks/election-definition-backend';
import {
  type BallotStyle,
  LanguageCode,
  type Party,
  type Precinct,
} from '@votingworks/types';
import {
  createMockApiClient,
  type MockApiClient,
  provideApi,
} from '../test/api_helpers.js';
import {
  render,
  screen,
  waitFor,
  within,
} from '../test/react_testing_library.js';
import { withRoute } from '../test/routing_helpers.js';
import {
  BallotStylesTable,
  type BallotStylesTableProps,
} from './ballot_styles_table.js';

const electionId = 'election-1';

const generalElectionInfo: ElectionInfo = {
  electionId,
  type: 'general',
  date: new DateWithoutTime('2026-11-03'),
  title: 'General Election',
  state: 'Demo State',
  jurisdictionName: 'Demo County',
  seal: '',
  languageCodes: [LanguageCode.ENGLISH],
};

const precincts: Precinct[] = [
  { id: 'center', name: 'Center Springfield', districtIds: ['district-1'] },
  {
    id: 'north',
    name: 'North Springfield',
    splits: [
      {
        id: 'north-1',
        name: 'North Springfield - Split 1',
        districtIds: ['district-1', 'district-2'],
      },
      {
        id: 'north-2',
        name: 'North Springfield - Split 2',
        districtIds: ['district-1'],
      },
      {
        id: 'north-3',
        name: 'North Springfield - Split 3',
        districtIds: ['district-3'],
      },
    ],
  },
  { id: 'south', name: 'South Springfield', districtIds: [] },
];

const parties: Party[] = [
  {
    id: 'party-1',
    name: 'Democrat',
    fullName: 'Democratic Party',
    abbrev: 'D',
  },
  {
    id: 'party-2',
    name: 'Republican',
    fullName: 'Republican Party',
    abbrev: 'R',
  },
];

const generalBallotStyles: BallotStyle[] = [
  {
    id: '1_en',
    groupId: '1',
    precincts: ['center', 'north'],
    districts: ['district-1'],
    languages: [LanguageCode.ENGLISH],
  },
  {
    id: '2_en',
    groupId: '2',
    precincts: ['north'],
    districts: ['district-1', 'district-2'],
    languages: [LanguageCode.ENGLISH],
  },
];

const primaryBallotStyles: BallotStyle[] = [
  {
    id: '1-D_en',
    groupId: '1-D',
    precincts: ['center', 'north'],
    districts: ['district-1'],
    partyId: 'party-1',
    languages: [LanguageCode.ENGLISH],
  },
  {
    id: '1-R_en',
    groupId: '1-R',
    precincts: ['center', 'north'],
    districts: ['district-1'],
    partyId: 'party-2',
    languages: [LanguageCode.ENGLISH],
  },
];

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderTable(
  electionInfo: ElectionInfo,
  ballotStyles: BallotStyle[],
  props: Partial<BallotStylesTableProps> = {}
) {
  const history = createMemoryHistory({ initialEntries: ['/ballots'] });
  apiMock.getElectionInfo.expectCallWith({ electionId }).resolves(electionInfo);
  apiMock.listPrecincts.expectCallWith({ electionId }).resolves(precincts);
  apiMock.listBallotStyles
    .expectCallWith({ electionId })
    .resolves(ballotStyles);
  apiMock.listParties.expectCallWith({ electionId }).resolves(parties);
  render(
    provideApi(
      apiMock,
      withRoute(<BallotStylesTable electionId={electionId} {...props} />, {
        paramPath: '/ballots',
        history,
      })
    )
  );
  return history;
}

async function getTableContents(): Promise<Array<string[]>> {
  const table = await screen.findByRole('table');
  return within(table)
    .getAllByRole('row')
    .map((row) =>
      [
        ...within(row).queryAllByRole('columnheader'),
        ...within(row).queryAllByRole('cell'),
      ].map((cell) => cell.textContent ?? '')
    );
}

test('lists ballot styles by precinct and split with view ballot links', async () => {
  const history = renderTable(generalElectionInfo, generalBallotStyles, {
    getViewBallotPath: (ballotStyleId, precinctId) =>
      `/ballots/${ballotStyleId}/${precinctId}`,
  });

  expect(await getTableContents()).toEqual([
    ['Precinct', 'Ballot Style', ''],
    ['Center Springfield', '1_en', 'View Ballot'],
    ['North Springfield', '', ''],
    ['North Springfield - Split 1', '2_en', 'View Ballot'],
    ['North Springfield - Split 2', '1_en', 'View Ballot'],
    ['North Springfield - Split 3', 'No contests assigned', ''],
    ['South Springfield', 'No contests assigned', ''],
  ]);
  const viewBallotPaths: string[] = [];
  for (const button of screen.getAllByRole('button', { name: 'View Ballot' })) {
    await userEvent.click(button);
    viewBallotPaths.push(history.location.pathname);
  }
  expect(viewBallotPaths).toEqual([
    '/ballots/1_en/center',
    '/ballots/2_en/north',
    '/ballots/1_en/north',
  ]);
});

test('omits view ballot links without getViewBallotPath', async () => {
  renderTable(generalElectionInfo, generalBallotStyles);

  expect(await getTableContents()).toContainEqual([
    'Center Springfield',
    '1_en',
    '',
  ]);
  expect(
    screen.queryByRole('button', { name: 'View Ballot' })
  ).not.toBeInTheDocument();
});

test('shows a party column for a primary election', async () => {
  renderTable({ ...generalElectionInfo, type: 'primary' }, primaryBallotStyles);

  expect(await getTableContents()).toEqual([
    ['Precinct', 'Ballot Style', 'Party', ''],
    ['Center Springfield', '1-D_en', 'Democratic Party', ''],
    ['Center Springfield', '1-R_en', 'Republican Party', ''],
    ['North Springfield', '', '', ''],
    ['North Springfield - Split 1', 'No contests assigned', '', ''],
    ['North Springfield - Split 2', '1-D_en', 'Democratic Party', ''],
    ['North Springfield - Split 2', '1-R_en', 'Republican Party', ''],
    ['North Springfield - Split 3', 'No contests assigned', '', ''],
    ['South Springfield', 'No contests assigned', '', ''],
  ]);
});

test('hides the party column for a combined ballot primary', async () => {
  renderTable(
    {
      ...generalElectionInfo,
      type: 'primary',
      isMiCombinedBallotPrimary: true,
    },
    generalBallotStyles
  );

  expect((await getTableContents())[0]).toEqual([
    'Precinct',
    'Ballot Style',
    '',
  ]);
});

test('renders nothing without ballot styles', async () => {
  renderTable(generalElectionInfo, []);

  await waitFor(() => apiMock.assertComplete());
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});
