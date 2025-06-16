import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import { sleep } from '@votingworks/basics';
import { createMemoryHistory } from 'history';
import { act, screen, within } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { AdjudicationSummaryScreen } from './adjudication_summary_screen';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { mockCastVoteRecordFileRecord } from '../../test/api_mock_data';

vi.setConfig({
  testTimeout: 20000,
});

const electionDefinition =
  electionTwoPartyPrimaryFixtures.readElectionDefinition();

let apiMock: ApiMock;

afterEach(async () => {
  apiMock.assertComplete();

  // Several tests on this page create test warnings because hooks run after
  // the end of the test, and there is no specific change on the page to check.
  // TODO: Remove after upgrade to React 18, which does not warn in this case.
  await act(async () => {
    await sleep(1);
  });
});

beforeEach(() => {
  apiMock = createApiMock();
});

test('No CVRs loaded', async () => {
  apiMock.expectGetAdjudicationQueueMetadata([]);
  apiMock.expectGetCastVoteRecordFiles([]);
  renderInAppContext(<AdjudicationSummaryScreen />, {
    electionDefinition,
    apiMock,
  });
  await screen.findByText('Load CVRs to begin adjudication.');
  expect(screen.queryAllByRole('button', { name: /Adjudicate/ })).toHaveLength(
    0
  );
});

test('When tally results already marked as official, buttons are disabled', async () => {
  apiMock.expectGetAdjudicationQueueMetadata([
    {
      contestId: 'zoo-council-mammal',
      pendingTally: 3,
      totalTally: 3,
    },
    {
      contestId: 'aquarium-council-fish',
      pendingTally: 5,
      totalTally: 5,
    },
  ]);
  apiMock.expectGetCastVoteRecordFiles([mockCastVoteRecordFileRecord]);
  renderInAppContext(<AdjudicationSummaryScreen />, {
    electionDefinition,
    isOfficialResults: true,
    apiMock,
  });

  await screen.findByText(/Adjudication is disabled/);

  const adjudicateButtons = await screen.findAllButtons(/Adjudicate/);
  for (const adjudicateButton of adjudicateButtons) {
    expect(adjudicateButton).toBeDisabled();
  }
});

test('When CVRs need adjudication, shows a table of contests', async () => {
  apiMock.expectGetAdjudicationQueueMetadata([
    {
      contestId: 'zoo-council-mammal',
      pendingTally: 3,
      totalTally: 3,
    },
    {
      contestId: 'aquarium-council-fish',
      pendingTally: 0,
      totalTally: 5,
    },
    {
      contestId: 'fishing',
      pendingTally: 3,
      totalTally: 5,
    },
  ]);
  apiMock.expectGetCastVoteRecordFiles([mockCastVoteRecordFileRecord]);
  const history = createMemoryHistory();
  renderInAppContext(<AdjudicationSummaryScreen />, {
    electionDefinition,
    apiMock,
    history,
  });

  expect(
    screen.queryByText('Load CVRs to begin adjudication.')
  ).not.toBeInTheDocument();

  const contestTable = await screen.findByRole('table');
  expect(
    within(contestTable)
      .getAllByRole('columnheader')
      .map((th) => th.textContent)
  ).toEqual(['Contest', 'Party', 'Adjudication Queue', 'Completed']);
  const rows = within(contestTable).getAllByRole('row');
  expect(rows).toHaveLength(electionDefinition.election.contests.length + 1);

  const [zooCouncilMammalRow, zooCouncilFishRow, fishingRow] = screen
    .getAllByRole('cell', { name: /Adjudicate/ })
    .map((cell) => cell.closest('tr')!);
  expect(
    within(zooCouncilMammalRow)
      .getAllByRole('cell')
      .map((cell) => cell.textContent)
  ).toEqual(['District 1, Zoo Council', 'Ma', 'Adjudicate 3', '0']);
  expect(
    within(zooCouncilFishRow)
      .getAllByRole('cell')
      .map((cell) => cell.textContent)
  ).toEqual(['District 1, Zoo Council', 'F', 'Adjudicate', '5']);
  expect(
    within(fishingRow)
      .getAllByRole('cell')
      .map((cell) => cell.textContent)
  ).toEqual(['District 1, Ballot Measure 3', '', 'Adjudicate 3', '2']);

  const adjudicateButtons = await screen.findAllByRole('button', {
    name: /Adjudicate/,
  });
  for (const adjudicateButton of adjudicateButtons) {
    expect(adjudicateButton).toBeEnabled();
  }

  userEvent.click(adjudicateButtons[0]);
  expect(history.location.pathname).toEqual('/adjudication/zoo-council-mammal');
});
