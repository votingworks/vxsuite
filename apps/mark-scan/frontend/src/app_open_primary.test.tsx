import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { electionOpenPrimaryFixtures } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { BallotStyleId, CandidateContest } from '@votingworks/types';
import { find } from '@votingworks/basics';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { render, screen } from '../test/react_testing_library';

import { App } from './app';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

vi.setConfig({ testTimeout: 30_000 });

const BALLOT_STYLE_ID = 'ballot-style-1' as BallotStyleId;
const PRECINCT_ID = 'precinct-1';
const PRECINCT_NAME = 'Precinct 1';
const POLLING_PLACE_ID = `${PRECINCT_ID}-polling-place`;
const electionDefinition = electionOpenPrimaryFixtures.readElectionDefinition();
const { election } = electionDefinition;

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiMock = createApiMock();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionRecord(electionDefinition);
  apiMock.expectGetElectionState({
    pollingPlaceId: POLLING_PLACE_ID,
    pollsState: 'polls_open',
  });
  apiMock.setPaperHandlerState('not_accepting_paper');
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

async function activateCardlessVoterSession() {
  // Poll worker logs in to activate a cardless voter session.
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await screen.findByText('Start a New Voting Session');

  apiMock.mockApiClient.startCardlessVoterSession
    .expectCallWith({
      ballotStyleId: BALLOT_STYLE_ID,
      precinctId: PRECINCT_ID,
    })
    .resolves();
  apiMock.expectSetAcceptingPaperState();
  userEvent.click(
    screen.getByText(
      hasTextAcrossElements(`Start Voting Session: ${PRECINCT_NAME}`)
    )
  );

  apiMock.setPaperHandlerState('accepting_paper');
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition, {
    cardlessVoterUserParams: {
      ballotStyleId: BALLOT_STYLE_ID,
      precinctId: PRECINCT_ID,
    },
  });
  await screen.findByText('Load Ballot Sheet');
  apiMock.setPaperHandlerState('waiting_for_ballot_data');

  // Poll worker removes card; voter takes over.
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: BALLOT_STYLE_ID,
    precinctId: PRECINCT_ID,
  });
  await screen.findByText('Start Voting');
}

test('poll worker activates session, voter picks party and walks through ballot', async () => {
  render(<App apiClient={apiMock.mockApiClient} />);
  await screen.findByText('Insert Card');

  await activateCardlessVoterSession();

  // Start screen -> party selection
  userEvent.click(screen.getByText('Start Voting'));
  await screen.findByRole('heading', { name: 'Choose Your Party' });

  // Next disabled until a party is selected
  expect(screen.getButton(/next/i)).toBeDisabled();

  // Select Democratic
  userEvent.click(screen.getButton('Democratic Party'));
  expect(screen.getButton(/next/i)).toBeEnabled();

  // Advance to the first contest — only Democratic + nonpartisan contests appear.
  userEvent.click(screen.getButton(/next/i));
  await screen.findByRole('heading', { name: 'Governor' });

  // Walk through all contests to review. The voter should see exactly the
  // Democratic partisan contests + all nonpartisan contests for
  // ballot-style-1 — and none of the Republican or Libertarian partisan
  // contests.
  const expectedContestTitles = [
    'Governor',
    'Secretary of State',
    'Attorney General',
    'Representative in Congress',
    'State Representative',
    'County Commissioner',
    'Delegate to County Convention',
    'Circuit Court Judge',
    'Probate Court Judge',
    'Board of Education Member',
    'County Road Millage Renewal',
    'Public Safety Millage',
    'Library Millage Renewal',
  ];
  for (const title of expectedContestTitles) {
    await screen.findByRole('heading', { name: title });
    userEvent.click(screen.getButton(/next/i));
  }
  await screen.findByRole('heading', { name: /review your votes/i });

  // From the review screen, "Change Party" lands on party selection in
  // review mode with a Review button to return.
  userEvent.click(screen.getButton(/change party/i));
  await screen.findByRole('heading', { name: 'Choose Your Party' });
  userEvent.click(screen.getButton(/review/i));
  await screen.findByRole('heading', { name: /review your votes/i });
});

test('switching party clears votes from the previous party', async () => {
  render(<App apiClient={apiMock.mockApiClient} />);
  await screen.findByText('Insert Card');

  await activateCardlessVoterSession();

  // Pick Democratic and vote for a Democratic Governor candidate
  userEvent.click(screen.getByText('Start Voting'));
  await screen.findByRole('heading', { name: 'Choose Your Party' });
  userEvent.click(screen.getButton('Democratic Party'));
  userEvent.click(screen.getButton(/next/i));
  await screen.findByRole('heading', { name: 'Governor' });

  const demGovernorContest = find(
    election.contests,
    (c): c is CandidateContest => c.id === 'governor-democratic'
  );
  const demGovernorCandidate = demGovernorContest.candidates[0];
  userEvent.click(screen.getByText(demGovernorCandidate.name));

  // Back to party selection, switch to Republican (clears votes), then back
  // to Democratic. The Democratic vote from earlier should be gone.
  userEvent.click(screen.getButton(/back/i));
  await screen.findByRole('heading', { name: 'Choose Your Party' });
  userEvent.click(screen.getButton('Republican Party'));
  // Confirm the change-party modal that appears because there are votes.
  userEvent.click(
    await screen.findByRole('button', { name: /^change party/i })
  );
  userEvent.click(screen.getButton(/next/i));
  await screen.findByRole('heading', { name: 'Governor' });

  // The Republican Governor candidates are shown, not the Democratic ones.
  const repGovernorContest = find(
    election.contests,
    (c): c is CandidateContest => c.id === 'governor-republican'
  );
  screen.getByText(repGovernorContest.candidates[0].name);
  expect(screen.queryByText(demGovernorCandidate.name)).toBeNull();

  userEvent.click(screen.getButton(/back/i));
  await screen.findByRole('heading', { name: 'Choose Your Party' });
  userEvent.click(screen.getButton('Democratic Party'));
  userEvent.click(screen.getButton(/next/i));
  await screen.findByRole('heading', { name: 'Governor' });

  // Jump to the review screen to inspect the Democratic Governor contest
  userEvent.click(screen.getButton(/view all/i));
  await screen.findByRole('heading', { name: /review your votes/i });

  // The Democratic Governor candidate the voter previously selected should
  // no longer appear on the review — vote was cleared by the party switch.
  expect(screen.queryByText(demGovernorCandidate.name)).toBeNull();
});
