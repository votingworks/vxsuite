import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { Route } from 'react-router-dom';

import {
  type BallotStyleGroupId,
  getContests,
  straightPartyNotYetImplemented,
  type Tabulation,
} from '@votingworks/types';
import { userEvent } from '@testing-library/user-event';
import {
  buildManualResultsFixture,
  getBallotStyleGroup,
} from '@votingworks/utils';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { createMemoryHistory } from 'history';
import type { ManualResultsIdentifier } from '@votingworks/admin-backend';
import { assert, mapObject } from '@votingworks/basics';
import { screen } from '../../../test/react_testing_library.js';
import { renderInAppContext } from '../../../test/render_in_app_context.js';
import { ManualTalliesFormScreen } from './manual_tallies_form_screen.js';
import {
  type ApiMock,
  createApiMock,
} from '../../../test/helpers/mock_api_client.js';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

const electionDefinition = readElectionTwoPartyPrimaryDefinition();
const { election } = electionDefinition;

const ballotStyleGroupId = '1M' as BallotStyleGroupId;
const votingMethod = 'absentee';
const precinctId = 'precinct-1';
const identifier: ManualResultsIdentifier = {
  ballotStyleGroupId,
  votingMethod,
  precinctId,
};

const ballotStyleGroup = getBallotStyleGroup({
  election,
  ballotStyleGroupId,
})!;
const contests = getContests({
  election,
  ballotStyle: ballotStyleGroup,
});

const resultsFixture = buildManualResultsFixture({
  election,
  ballotCount: 10,
  contestResultsSummaries: {
    'best-animal-mammal': {
      type: 'candidate',
      ballots: 10,
      overvotes: 1,
      undervotes: 3,
      officialOptionTallies: {
        horse: 2,
        otter: 2,
        fox: 2,
      },
    },
    'zoo-council-mammal': {
      type: 'candidate',
      ballots: 10,
      overvotes: 6,
      undervotes: 4,
      officialOptionTallies: {
        zebra: 5,
        lion: 5,
        kangaroo: 5,
        elephant: 5,
      },
    },
    'new-zoo-either': {
      type: 'yesno',
      ballots: 10,
      overvotes: 2,
      undervotes: 2,
      yesTally: 3,
      noTally: 3,
    },
    'new-zoo-pick': {
      type: 'yesno',
      ballots: 10,
      overvotes: 2,
      undervotes: 2,
      yesTally: 3,
      noTally: 3,
    },
    fishing: {
      type: 'yesno',
      ballots: 10,
      overvotes: 2,
      undervotes: 2,
      yesTally: 3,
      noTally: 3,
    },
  },
});
const mockValidResults: Tabulation.ManualElectionResults = {
  ...resultsFixture,
  contestResults: Object.fromEntries(
    contests.map((contest) => [
      contest.id,
      resultsFixture.contestResults[contest.id]!,
    ])
  ),
};

function zeroResults(
  contest: (typeof contests)[number],
  {
    ballots,
    undervotes = 0,
  }: {
    ballots: number;
    undervotes?: number;
  }
): Tabulation.ContestResults {
  if (contest.type === 'candidate') {
    return {
      contestId: contest.id,
      contestType: 'candidate',
      votesAllowed: contest.seats,
      ballots,
      overvotes: 0,
      undervotes,
      tallies: Object.fromEntries(
        contest.candidates.map((candidate) => [
          candidate.id,
          { id: candidate.id, name: candidate.name, tally: 0 },
        ])
      ),
    };
  }
  assert(contest.type === 'yesno');
  return {
    contestId: contest.id,
    contestType: 'yesno',
    ballots,
    overvotes: 0,
    undervotes,
    tallies: Object.fromEntries(
      contest.options.map((option) => [option.id, 0])
    ),
  };
}

function renderScreen({
  initialRoute = `/tally/manual/${ballotStyleGroupId}/${votingMethod}/${precinctId}`,
}: {
  initialRoute?: string;
} = {}) {
  const history = createMemoryHistory({
    initialEntries: [initialRoute],
  });
  return {
    ...renderInAppContext(
      <Route path="/tally/manual/:ballotStyleGroupId/:votingMethod/:precinctId">
        <ManualTalliesFormScreen />
      </Route>,
      {
        history,
        electionDefinition,
        apiMock,
      }
    ),
    history,
  };
}

test('entering contest tallies for a new manual tally', async () => {
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetManualResults(identifier, undefined);
  const { history } = renderScreen();

  await screen.findByRole('heading', { name: 'Edit Tallies' });
  screen.getByText(hasTextAcrossElements(/Ballot StylePrecinct 1 - Mammal/));
  screen.getByText(hasTextAcrossElements(/Voting MethodAbsentee/));

  screen.getButton('Close');
  let updatedResults: Tabulation.ManualElectionResults = {
    ...mockValidResults,
    contestResults: {},
  };

  // Enter tallies for each contest
  for (const [i, contest] of contests.entries()) {
    const district = election.districts.find(
      ({ id }) => id === contest.districtId
    )!;
    const contestResults = mockValidResults.contestResults[contest.id]!;
    const contestNumber = i + 1;
    await screen.findByText(`${contestNumber} of ${contests.length}`);
    screen.getByRole('heading', { name: contest.title });
    screen.getByText(district.name);
    if (contest.type === 'candidate') {
      screen.getByText(`Vote for ${contest.seats}`);
    }
    screen.getByText('No tallies entered');

    const saveButtonLabel =
      contestNumber === contests.length ? 'Finish' : 'Save & Next';
    expect(screen.getButton(saveButtonLabel)).toBeEnabled();

    const ballotCountInput = screen.getByLabelText('Ballot Count');
    if (i === 0) {
      expect(screen.getButton('Previous')).toBeDisabled();
      expect(ballotCountInput).toHaveValue('');
      expect(ballotCountInput).toHaveFocus();
      await userEvent.type(
        ballotCountInput,
        mockValidResults.ballotCount.toString()
      );
    } else {
      expect(screen.getButton('Previous')).toBeEnabled();
      expect(ballotCountInput).toHaveValue(`${mockValidResults.ballotCount}`);
      expect(screen.getByLabelText('Undervotes')).toHaveFocus();
    }

    const overvotesInput = screen.getByLabelText('Overvotes');
    expect(overvotesInput).toHaveValue('');
    await userEvent.type(overvotesInput, contestResults.overvotes.toString());
    screen.getByText(/votes? too (few|many)/);
    expect(screen.getButton(saveButtonLabel)).toBeEnabled();

    const undervotesInput = screen.getByLabelText('Undervotes');
    expect(undervotesInput).toHaveValue('');
    await userEvent.type(undervotesInput, contestResults.undervotes.toString());

    if (contest.type === 'straight-party') {
      straightPartyNotYetImplemented();
    }
    if (contest.type === 'candidate') {
      assert(contestResults.contestType === 'candidate');
      for (const candidate of contest.candidates) {
        const candidateInput = screen.getByLabelText(candidate.name);
        expect(candidateInput).toHaveValue('');
        await userEvent.type(
          candidateInput,
          contestResults.tallies[candidate.id]!.tally.toString()
        );
      }
    } else {
      assert(contestResults.contestType === 'yesno');
      for (const option of contest.options) {
        const optionInput = screen.getByLabelText(option.label);
        expect(optionInput).toHaveValue('');
        await userEvent.type(
          optionInput,
          (contestResults.tallies[option.id] ?? 0).toString()
        );
      }
    }
    screen.getByText('Entered votes match expected');

    updatedResults = {
      ...updatedResults,
      contestResults: {
        ...updatedResults.contestResults,
        [contest.id]: contestResults,
      },
    };
    apiMock.expectSetManualResults({
      ...identifier,
      manualResults: updatedResults,
    });
    apiMock.expectGetManualResults(identifier, updatedResults);
    apiMock.expectGetWriteInCandidates([]);
    await userEvent.click(screen.getButton(saveButtonLabel));
  }

  await vi.waitFor(() =>
    expect(history.location.pathname).toEqual('/tally/manual')
  );
});

test('blank tallies are saved as zeros', async () => {
  const initialResults: Tabulation.ManualElectionResults = {
    ballotCount: 10,
    contestResults: {},
  };
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetManualResults(identifier, initialResults);
  renderScreen({
    initialRoute: `/tally/manual/${ballotStyleGroupId}/${votingMethod}/${precinctId}/${contests[0]!.id}`,
  });

  await screen.findByRole('heading', { name: contests[0]!.title });
  screen.getByText('No tallies entered');
  await userEvent.type(screen.getByLabelText('Ballot Count'), '10');
  await userEvent.type(screen.getByLabelText('Undervotes'), '10');
  screen.getByText('Entered votes match expected');

  const resultsAfterFirstContest: Tabulation.ManualElectionResults = {
    ballotCount: 10,
    contestResults: {
      [contests[0]!.id]: zeroResults(contests[0]!, {
        ballots: 10,
        undervotes: 10,
      }),
    },
  };
  apiMock.expectSetManualResults({
    ...identifier,
    manualResults: resultsAfterFirstContest,
  });
  apiMock.expectGetManualResults(identifier, resultsAfterFirstContest);
  apiMock.expectGetWriteInCandidates([]);
  await userEvent.click(screen.getButton('Save & Next'));

  await screen.findByRole('heading', { name: contests[1]!.title });
  screen.getByText('No tallies entered');
  const resultsAfterSecondContest: Tabulation.ManualElectionResults = {
    ballotCount: 10,
    contestResults: {
      ...resultsAfterFirstContest.contestResults,
      [contests[1]!.id]: zeroResults(contests[1]!, { ballots: 10 }),
    },
  };
  apiMock.expectSetManualResults({
    ...identifier,
    manualResults: resultsAfterSecondContest,
  });
  apiMock.expectGetManualResults(identifier, resultsAfterSecondContest);
  apiMock.expectGetWriteInCandidates([]);
  await userEvent.click(screen.getButton('Save & Next'));
  await screen.findByRole('heading', { name: contests[2]!.title });
});

test('shows expected and entered vote totals', async () => {
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetManualResults(identifier, mockValidResults);
  renderScreen({
    initialRoute: `/tally/manual/${ballotStyleGroupId}/${votingMethod}/${precinctId}/${contests[0]!.id}`,
  });

  await screen.findByRole('heading', { name: contests[0]!.title });
  screen.getByText(hasTextAcrossElements('Votes expected10'));
  screen.getByText(hasTextAcrossElements('Votes entered10'));
  screen.getByText('Entered votes match expected');
  expect(screen.queryByText(/ballots ×/)).not.toBeInTheDocument();
  expect(
    screen.queryByText(/for each overvoted ballot/)
  ).not.toBeInTheDocument();

  apiMock.expectSetManualResults({
    ...identifier,
    manualResults: mockValidResults,
  });
  apiMock.expectGetManualResults(identifier, mockValidResults);
  apiMock.expectGetWriteInCandidates([]);
  await userEvent.click(screen.getButton('Save & Next'));

  await screen.findByRole('heading', { name: contests[1]!.title });
  screen.getByText('Vote for 3');
  screen.getByText('Enter 3 for each overvoted ballot');
  screen.getByText(
    hasTextAcrossElements('Votes expected10 ballots × 3 votes = 30')
  );
  screen.getByText(hasTextAcrossElements('Votes entered30'));
  screen.getByText('Entered votes match expected');

  const overvotesInput = screen.getByLabelText('Overvotes');
  await userEvent.clear(overvotesInput);
  await userEvent.type(overvotesInput, '4');
  screen.getByText(hasTextAcrossElements('Votes entered28'));
  screen.getByText('2 votes too few');

  await userEvent.clear(overvotesInput);
  await userEvent.type(overvotesInput, '7');
  screen.getByText('1 vote too many');

  const ballotCountInput = screen.getByLabelText('Ballot Count');
  await userEvent.clear(ballotCountInput);
  await userEvent.type(ballotCountInput, '1');
  screen.getByText(
    hasTextAcrossElements('Votes expected1 ballot × 3 votes = 3')
  );
  screen.getByText('28 votes too many');
});

test('editing existing tallies', async () => {
  // Cover alternate voting method
  const precinctIdentifier: ManualResultsIdentifier = {
    ...identifier,
    votingMethod: 'precinct',
  };
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetManualResults(precinctIdentifier, mockValidResults);
  renderScreen({
    initialRoute: `/tally/manual/${ballotStyleGroupId}/precinct/${precinctId}`,
  });

  await screen.findByRole('heading', { name: 'Edit Tallies' });
  screen.getByText(hasTextAcrossElements(/Voting MethodPrecinct/));

  // Edit contest tallies
  const contest = contests[0]!;
  await screen.findByText(`1 of ${contests.length}`);
  assert(contest.type === 'candidate');
  const contestResults = mockValidResults.contestResults[contest.id]!;
  assert(contestResults.contestType === 'candidate');
  const ballotCountInput = screen.getByLabelText('Ballot Count');
  expect(ballotCountInput).toHaveValue(`${mockValidResults.ballotCount}`);
  await userEvent.clear(ballotCountInput);
  await userEvent.type(
    ballotCountInput,
    (mockValidResults.ballotCount * 2).toString()
  );
  const inputs = [
    ['Overvotes', contestResults.overvotes],
    ['Undervotes', contestResults.undervotes],
    ...contest.candidates.map((candidate): [string, number] => [
      candidate.name,
      contestResults.tallies[candidate.id]!.tally,
    ]),
  ] as const;
  for (const [label, value] of inputs) {
    screen.getByText(/votes? too (few|many)/);
    const input = screen.getByLabelText(label);
    expect(input).toHaveValue(`${value}`);
    await userEvent.clear(input);
    screen.getByText(/votes? too (few|many)/);
    expect(screen.getButton('Save & Next')).toBeEnabled();
    await userEvent.type(input, 'abc'); // Non-number shouldn't do anything
    await userEvent.type(input, (value * 2).toString());
  }
  screen.getByText('Entered votes match expected');

  const updatedResults: Tabulation.ManualElectionResults = {
    ballotCount: mockValidResults.ballotCount * 2,
    contestResults: {
      ...mockValidResults.contestResults,
      [contest.id]: {
        ...contestResults,
        ballots: mockValidResults.ballotCount * 2,
        undervotes: contestResults.undervotes * 2,
        overvotes: contestResults.overvotes * 2,
        tallies: mapObject(contestResults.tallies, (candidateTally) => ({
          ...candidateTally,
          tally: candidateTally.tally * 2,
        })),
      },
    },
  };
  apiMock.expectSetManualResults({
    ...precinctIdentifier,
    manualResults: updatedResults,
  });
  apiMock.expectGetManualResults(precinctIdentifier, updatedResults);
  apiMock.expectGetWriteInCandidates([]);
  await userEvent.click(screen.getButton('Save & Next'));
  await screen.findByText(`2 of ${contests.length}`);
});

test('cannot add negative or decimal tallies', async () => {
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetManualResults(identifier, undefined);
  renderScreen();

  await screen.findByRole('heading', { name: 'Edit Tallies' });
  screen.getByText(hasTextAcrossElements(/Ballot StylePrecinct 1 - Mammal/));
  screen.getByText(hasTextAcrossElements(/Voting MethodAbsentee/));

  const ballotCountInput = await screen.findByLabelText('Ballot Count');

  await userEvent.type(ballotCountInput, '-100');
  expect(ballotCountInput).toHaveValue('100');

  await userEvent.clear(ballotCountInput);
  await userEvent.type(ballotCountInput, '10.2');
  expect(ballotCountInput).toHaveValue('102');
});

test('adding new write-in candidates', async () => {
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetManualResults(identifier, mockValidResults);
  renderScreen({
    initialRoute: `/tally/manual/${ballotStyleGroupId}/${votingMethod}/${precinctId}/best-animal-mammal`,
  });

  // best animal mammal contest shouldn't allow a write-in
  await screen.findByRole('heading', { name: 'Best Animal' });
  await vi.waitFor(() => {
    expect(
      screen.queryByText('Add Write-In Candidate')
    ).not.toBeInTheDocument();
  });
  apiMock.expectSetManualResults({
    ...identifier,
    manualResults: mockValidResults,
  });
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetManualResults(identifier, mockValidResults);
  await userEvent.click(screen.getButton('Save & Next'));

  // zoo council mammal contest should allow write-ins
  await screen.findByRole('heading', { name: 'Zoo Council' });
  await userEvent.click(screen.getButton('Add Write-In Candidate'));
  const writeInInput = screen.getByLabelText('Write-in');
  expect(writeInInput).toHaveFocus();
  // Original button should have been replaced
  expect(screen.queryByText('Add Write-In Candidate')).not.toBeInTheDocument();
  // Enter should be disabled - we can tell since Add button is still around after Enter
  await userEvent.type(writeInInput, '{Enter}');
  // "Add" button should be disabled
  expect(screen.getButton('Add')).toBeDisabled();

  // Type in a pre-existing name
  await userEvent.type(writeInInput, 'Zebra');
  // Enter should be disabled
  await userEvent.type(writeInInput, '{Enter}');
  // "Add" button should be disabled
  expect(screen.getButton('Add')).toBeDisabled();

  // Cancel, re-open, and add new
  await userEvent.click(screen.getButton('Cancel'));
  await userEvent.click(screen.getButton('Add Write-In Candidate'));
  await userEvent.type(screen.getByLabelText('Write-in'), 'Mock Candidate');
  await userEvent.click(screen.getButton('Add'));
  screen.getByText('Entered votes match expected');

  // Can add to new write-in candidate's count
  await userEvent.type(
    screen.getByLabelText('Mock Candidate (write-in)'),
    '30'
  );

  // Write-in counts affect validation
  screen.getByText(/votes? too (few|many)/);

  // Can remove our write-in
  await userEvent.click(screen.getButton('Remove'));
  expect(
    screen.queryByText('Mock Candidate (write-in)')
  ).not.toBeInTheDocument();
  screen.getByText('Entered votes match expected');

  // Add back the candidate and save
  await userEvent.click(screen.getButton('Add Write-In Candidate'));
  // add using key "Enter" shortcut
  await userEvent.type(
    screen.getByLabelText('Write-in'),
    'Mock Candidate{Enter}'
  );
  await userEvent.type(
    screen.getByLabelText('Mock Candidate (write-in)'),
    '10'
  );

  // saves temp write-in candidate to backend
  assert(
    mockValidResults.contestResults['zoo-council-mammal']!.contestType ===
      'candidate'
  );
  const updatedResults: Tabulation.ManualElectionResults = {
    ...mockValidResults,
    contestResults: {
      ...mockValidResults.contestResults,
      'zoo-council-mammal': {
        ...mockValidResults.contestResults['zoo-council-mammal']!,
        tallies: {
          ...mockValidResults.contestResults['zoo-council-mammal']!.tallies,
          'temp-write-in-(Mock Candidate)': {
            id: 'temp-write-in-(Mock Candidate)',
            name: 'Mock Candidate',
            tally: 10,
            isWriteIn: true,
          },
        },
      },
    },
  };
  apiMock.expectSetManualResults({
    ...identifier,
    manualResults: updatedResults,
  });
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetManualResults(identifier, updatedResults);
  await userEvent.click(screen.getButton('Save & Next'));
  await screen.findByText(`3 of ${contests.length}`);
});

test('loads adjudicated write-in candidates', async () => {
  // Set up an existing adjudicated value
  apiMock.expectGetWriteInCandidates([
    {
      electionId: 'uuid',
      contestId: 'zoo-council-mammal',
      name: 'Chimera',
      id: 'chimera',
    },
  ]);
  apiMock.expectGetManualResults(identifier, mockValidResults);

  renderScreen({
    initialRoute: `/tally/manual/${ballotStyleGroupId}/${votingMethod}/${precinctId}/zoo-council-mammal`,
  });

  // Adjudicated value should be in the form and not be removable
  const writeInInput = await screen.findByLabelText('Chimera (write-in)');
  expect(screen.queryByText('Remove')).not.toBeInTheDocument();
  expect(writeInInput).toHaveValue('');

  // Can edit
  await userEvent.type(writeInInput, '30');
  expect(writeInInput).toHaveValue('30');

  const contestResults = mockValidResults.contestResults['zoo-council-mammal']!;
  assert(contestResults.contestType === 'candidate');
  const updatedResults: Tabulation.ManualElectionResults = {
    ...mockValidResults,
    contestResults: {
      ...mockValidResults.contestResults,
      'zoo-council-mammal': {
        ...contestResults,
        tallies: {
          ...contestResults.tallies,
          chimera: {
            id: 'chimera',
            name: 'Chimera',
            tally: 30,
            isWriteIn: true,
          },
        },
      },
    },
  };
  apiMock.expectSetManualResults({
    ...identifier,
    manualResults: updatedResults,
  });
  apiMock.expectGetWriteInCandidates([
    {
      electionId: 'uuid',
      contestId: 'zoo-council-mammal',
      name: 'Chimera',
      id: 'chimera',
    },
  ]);
  apiMock.expectGetManualResults(identifier, updatedResults);
  await userEvent.click(screen.getButton('Save & Next'));
  await screen.findByText(`3 of ${contests.length}`);
});

test('previous button', async () => {
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetManualResults(identifier, mockValidResults);
  renderScreen({
    initialRoute: `/tally/manual/${ballotStyleGroupId}/${votingMethod}/${precinctId}/${contests[1]!.id}`,
  });

  await screen.findByRole('heading', { name: contests[1]!.title });
  await userEvent.click(screen.getButton('Previous'));

  await screen.findByRole('heading', { name: contests[0]!.title });
  expect(screen.getButton('Previous')).toBeDisabled();
});

test('close button', async () => {
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetManualResults(identifier, undefined);
  const { history } = renderScreen();

  await screen.findByRole('heading', { name: 'Edit Tallies' });
  await userEvent.click(screen.getButton('Close'));
  await vi.waitFor(() =>
    expect(history.location.pathname).toEqual('/tally/manual')
  );
});

test('ballot count carries forward to contests not yet entered', async () => {
  const savedResults: Tabulation.ManualElectionResults = {
    ballotCount: 10,
    contestResults: {
      [contests[0]!.id]: mockValidResults.contestResults[contests[0]!.id]!,
      [contests[3]!.id]: mockValidResults.contestResults[contests[3]!.id]!,
    },
  };
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetManualResults(identifier, savedResults);
  renderScreen({
    initialRoute: `/tally/manual/${ballotStyleGroupId}/${votingMethod}/${precinctId}/${contests[1]!.id}`,
  });

  await screen.findByRole('heading', { name: contests[1]!.title });
  const ballotCountInput = screen.getByLabelText('Ballot Count');
  expect(ballotCountInput).toHaveValue('10');
  await userEvent.clear(ballotCountInput);
  await userEvent.type(ballotCountInput, '4');
  await userEvent.type(screen.getByLabelText('Undervotes'), '12');
  screen.getByText('Entered votes match expected');

  const resultsAfterSecondContest: Tabulation.ManualElectionResults = {
    ballotCount: 10,
    contestResults: {
      ...savedResults.contestResults,
      [contests[1]!.id]: zeroResults(contests[1]!, {
        ballots: 4,
        undervotes: 12,
      }),
    },
  };
  apiMock.expectSetManualResults({
    ...identifier,
    manualResults: resultsAfterSecondContest,
  });
  apiMock.expectGetManualResults(identifier, resultsAfterSecondContest);
  apiMock.expectGetWriteInCandidates([]);
  await userEvent.click(screen.getButton('Save & Next'));

  await screen.findByRole('heading', { name: contests[2]!.title });
  expect(screen.getByLabelText('Ballot Count')).toHaveValue('4');

  const resultsAfterThirdContest: Tabulation.ManualElectionResults = {
    ballotCount: 10,
    contestResults: {
      ...resultsAfterSecondContest.contestResults,
      [contests[2]!.id]: zeroResults(contests[2]!, { ballots: 4 }),
    },
  };
  apiMock.expectSetManualResults({
    ...identifier,
    manualResults: resultsAfterThirdContest,
  });
  apiMock.expectGetManualResults(identifier, resultsAfterThirdContest);
  apiMock.expectGetWriteInCandidates([]);
  await userEvent.click(screen.getButton('Save & Next'));

  await screen.findByRole('heading', { name: contests[3]!.title });
  expect(screen.getByLabelText('Ballot Count')).toHaveValue('10');
});

test('keeps the saved overall ballot count when the first contest has not been entered', async () => {
  const savedResults: Tabulation.ManualElectionResults = {
    ballotCount: 7,
    contestResults: {},
  };
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetManualResults(identifier, savedResults);
  renderScreen({
    initialRoute: `/tally/manual/${ballotStyleGroupId}/${votingMethod}/${precinctId}/${contests[1]!.id}`,
  });

  await screen.findByRole('heading', { name: contests[1]!.title });
  expect(screen.getByLabelText('Ballot Count')).toHaveValue('');

  const updatedResults: Tabulation.ManualElectionResults = {
    ballotCount: 7,
    contestResults: {
      [contests[1]!.id]: zeroResults(contests[1]!, { ballots: 0 }),
    },
  };
  apiMock.expectSetManualResults({
    ...identifier,
    manualResults: updatedResults,
  });
  apiMock.expectGetManualResults(identifier, updatedResults);
  apiMock.expectGetWriteInCandidates([]);
  await userEvent.click(screen.getButton('Save & Next'));
  await screen.findByRole('heading', { name: contests[2]!.title });
});

test('candidates are ordered according to ballot style rotation', async () => {
  const testBallotStyleGroupId = '1M' as BallotStyleGroupId;
  const mammalContestId = 'best-animal-mammal';

  // Set up mock candidate orderings with non-default rotation:
  apiMock.apiClient.getCandidateOrderings.mockImplementation((input) => {
    if (input.ballotStyleGroupId !== testBallotStyleGroupId) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      [mammalContestId]: [
        { id: 'fox' }, // original: horse, otter, fox
        { id: 'otter' },
        { id: 'horse' },
      ],
    });
  });

  const testIdentifier: ManualResultsIdentifier = {
    ballotStyleGroupId: testBallotStyleGroupId,
    votingMethod: 'absentee',
    precinctId: 'precinct-1',
  };

  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetManualResults(testIdentifier, undefined);

  renderInAppContext(
    <Route path="/tally/manual/:ballotStyleGroupId/:votingMethod/:precinctId">
      <ManualTalliesFormScreen />
    </Route>,
    {
      history: createMemoryHistory({
        initialEntries: [
          `/tally/manual/${testBallotStyleGroupId}/${testIdentifier.votingMethod}/${testIdentifier.precinctId}`,
        ],
      }),
      electionDefinition,
      apiMock,
    }
  );

  await screen.findByRole('heading', { name: 'Edit Tallies' });

  // Check that candidates appear in the rotated order
  await screen.findByRole('heading', { name: 'Best Animal' });

  // Wait for candidate inputs and get them by label
  const foxInput = screen.getByLabelText('Fox');
  const otterInput = screen.getByLabelText('Otter');
  const horseInput = screen.getByLabelText('Horse');

  // Get all textbox inputs to check order in DOM
  const allInputs = screen.getAllByRole('textbox');
  expect(allInputs[0]!.id).toEqual('numBallots');
  expect(allInputs[1]!.id).toEqual('undervotes');
  expect(allInputs[2]!.id).toEqual('overvotes');
  expect(allInputs[3]).toEqual(foxInput);
  expect(allInputs[4]).toEqual(otterInput);
  expect(allInputs[5]).toEqual(horseInput);
});

test('cross-endorsed candidates appear only once in manual tallies form', async () => {
  const testBallotStyleGroupId = '1M' as BallotStyleGroupId;
  const mammalContestId = 'best-animal-mammal';

  // Set up mock candidate orderings with cross-endorsed candidates
  // (a candidate appearing multiple times with different partyIds)
  apiMock.apiClient.getCandidateOrderings.mockImplementation((input) => {
    if (input.ballotStyleGroupId !== testBallotStyleGroupId) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      [mammalContestId]: [
        { id: 'otter' },
        { id: 'fox', partyIds: ['0'] },
        { id: 'horse' },
        { id: 'fox', partyIds: ['1'] }, // fox appears twice with different parties
      ],
    });
  });

  const testIdentifier: ManualResultsIdentifier = {
    ballotStyleGroupId: testBallotStyleGroupId,
    votingMethod: 'absentee',
    precinctId: 'precinct-1',
  };

  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetManualResults(testIdentifier, undefined);

  renderInAppContext(
    <Route path="/tally/manual/:ballotStyleGroupId/:votingMethod/:precinctId">
      <ManualTalliesFormScreen />
    </Route>,
    {
      history: createMemoryHistory({
        initialEntries: [
          `/tally/manual/${testBallotStyleGroupId}/${testIdentifier.votingMethod}/${testIdentifier.precinctId}`,
        ],
      }),
      electionDefinition,
      apiMock,
    }
  );

  await screen.findByRole('heading', { name: 'Edit Tallies' });

  // Check that fox appears only once despite being in orderedCandidatesByContest twice
  await screen.findByRole('heading', { name: 'Best Animal' });

  // Verify the inputs to appear
  const foxInput = screen.getByLabelText('Fox');
  const otterInput = screen.getByLabelText('Otter');
  const horseInput = screen.getByLabelText('Horse');

  // Verify fox appears only once
  const foxInputs = screen.queryAllByLabelText('Fox');
  expect(foxInputs).toHaveLength(1);

  // Get all textbox inputs to check order in DOM, fox should appear only once in first ordered spot
  const allInputs = screen.getAllByRole('textbox');
  expect(allInputs[0]!.id).toEqual('numBallots');
  expect(allInputs[1]!.id).toEqual('undervotes');
  expect(allInputs[2]!.id).toEqual('overvotes');
  expect(allInputs[3]).toEqual(otterInput);
  expect(allInputs[4]).toEqual(foxInput);
  expect(allInputs[5]).toEqual(horseInput);
});
