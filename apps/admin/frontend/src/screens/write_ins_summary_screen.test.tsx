import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import { sleep } from '@votingworks/basics';
import { createMemoryHistory } from 'history';
import { act, screen } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { WriteInsSummaryScreen } from './write_ins_summary_screen';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

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
  apiMock.expectGetWriteInAdjudicationQueueMetadata([]);
  apiMock.expectGetCastVoteRecordFiles([]);
  renderInAppContext(<WriteInsSummaryScreen />, {
    electionDefinition,
    apiMock,
  });
  await screen.findByText('Load CVRs to begin adjudicating write-in votes.');
  expect(screen.queryAllByRole('button', { name: /Adjudicate/ })).toHaveLength(
    0
  );
});

test('Tally results already marked as official', async () => {
  apiMock.expectGetWriteInAdjudicationQueueMetadata([
    {
      contestId: 'zoo-council-mammal',
      pendingTally: 3,
      totalTally: 3,
    },
    {
      contestId: 'zoo-council-mammal',
      pendingTally: 5,
      totalTally: 5,
    },
  ]);
  apiMock.expectGetCastVoteRecordFiles([]);
  renderInAppContext(<WriteInsSummaryScreen />, {
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

test('CVRs with write-ins loaded', async () => {
  apiMock.expectGetWriteInAdjudicationQueueMetadata([
    {
      contestId: 'zoo-council-mammal',
      pendingTally: 3,
      totalTally: 3,
    },
  ]);
  apiMock.expectGetCastVoteRecordFiles([]);
  const history = createMemoryHistory();
  renderInAppContext(<WriteInsSummaryScreen />, {
    electionDefinition,
    apiMock,
    history,
  });

  const adjudicateButton = await screen.findButton('Adjudicate 3');
  expect(adjudicateButton).not.toBeDisabled();

  userEvent.click(adjudicateButton);
  expect(history.location.pathname).toEqual(
    '/write-ins/adjudication/zoo-council-mammal'
  );
});
