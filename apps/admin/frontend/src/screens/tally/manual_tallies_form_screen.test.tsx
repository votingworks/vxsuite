import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { Route } from 'react-router-dom';

import {
  BallotStyleGroupId,
  getContests,
  Tabulation,
} from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import {
  buildManualResultsFixture,
  getBallotStyleGroup,
} from '@votingworks/utils';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { createMemoryHistory } from 'history';
import { ManualResultsIdentifier } from '@votingworks/admin-backend';
import { assert, mapObject } from '@votingworks/basics';
import { screen, waitFor } from '../../../test/react_testing_library';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { ManualTalliesFormScreen } from './manual_tallies_form_screen';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';

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
      resultsFixture.contestResults[contest.id],
    ])
  ),
};

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

test('entering initial ballot count and contest tallies', async () => {
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetManualResults(identifier, undefined);
  const { history } = renderScreen();

  await screen.findByRole('heading', { name: 'Edit Tallies' });
  screen.getByText(hasTextAcrossElements('Ballot Style1M'));
  screen.getByText(hasTextAcrossElements('PrecinctPrecinct 1'));
  screen.getByText(hasTextAcrossElements('Voting MethodAbsentee'));

  // Enter ballot count
  screen.getButton('Close');
  screen.getButton('Cancel');
  expect(screen.getButton('Save & Next')).toBeDisabled();
  userEvent.type(
    screen.getByLabelText('Total Ballots Cast'),
    mockValidResults.ballotCount.toString()
  );
  let updatedResults: Tabulation.ManualElectionResults = {
    ...mockValidResults,
    contestResults: {},
  };
  apiMock.expectSetManualResults({
    ...identifier,
    manualResults: updatedResults,
  });
  apiMock.expectGetManualResults(identifier, updatedResults);
  apiMock.expectGetWriteInCandidates([]);
  userEvent.click(screen.getButton('Save & Next'));

  // Enter tallies for each contest
  for (const [i, contest] of contests.entries()) {
    const district = election.districts.find(
      ({ id }) => id === contest.districtId
    )!;
    const contestResults = mockValidResults.contestResults[contest.id];
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

    const ballotCountInput = screen.getByLabelText('Total Ballots Cast');
    expect(ballotCountInput).toHaveValue(mockValidResults.ballotCount);
    expect(ballotCountInput).toBeDisabled();

    const overvotesInput = screen.getByLabelText('Overvotes');
    expect(overvotesInput).toHaveValue(null);
    userEvent.type(overvotesInput, contestResults.overvotes.toString());
    screen.getByText('Incomplete tallies');
    expect(screen.getButton(saveButtonLabel)).toBeDisabled();

    const undervotesInput = screen.getByLabelText('Undervotes');
    expect(undervotesInput).toHaveValue(null);
    userEvent.type(undervotesInput, contestResults.undervotes.toString());

    if (contest.type === 'candidate') {
      assert(contestResults.contestType === 'candidate');
      for (const candidate of contest.candidates) {
        const candidateInput = screen.getByLabelText(candidate.name);
        expect(candidateInput).toHaveValue(null);
        userEvent.type(
          candidateInput,
          contestResults.tallies[candidate.id].tally.toString()
        );
      }
    } else {
      assert(contestResults.contestType === 'yesno');
      const yesInput = screen.getByLabelText(contest.yesOption.label);
      expect(yesInput).toHaveValue(null);
      userEvent.type(yesInput, contestResults.yesTally.toString());
      const noInput = screen.getByLabelText(contest.noOption.label);
      expect(noInput).toHaveValue(null);
      userEvent.type(noInput, contestResults.noTally.toString());
    }
    screen.getByText('Entered tallies are valid');

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
    userEvent.click(screen.getButton(saveButtonLabel));
  }

  await waitFor(() =>
    expect(history.location.pathname).toEqual('/tally/manual')
  );
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
  screen.getByText(hasTextAcrossElements('Voting MethodPrecinct'));

  // Edit ballot count
  const ballotCountInput = screen.getByLabelText('Total Ballots Cast');
  expect(ballotCountInput).toHaveValue(mockValidResults.ballotCount);
  userEvent.clear(ballotCountInput);
  expect(screen.getButton('Save & Next')).toBeDisabled();
  userEvent.type(
    ballotCountInput,
    (mockValidResults.ballotCount * 2).toString()
  );

  let updatedResults: Tabulation.ManualElectionResults = {
    ballotCount: mockValidResults.ballotCount * 2,
    contestResults: mapObject(
      mockValidResults.contestResults,
      (contestResults) => ({
        ...contestResults,
        ballots: mockValidResults.ballotCount * 2,
      })
    ),
  };
  apiMock.expectSetManualResults({
    ...precinctIdentifier,
    manualResults: updatedResults,
  });
  apiMock.expectGetManualResults(precinctIdentifier, updatedResults);
  apiMock.expectGetWriteInCandidates([]);
  userEvent.click(screen.getButton('Save & Next'));

  // Edit contest tallies
  const contest = contests[0];
  await screen.findByText(`1 of ${contests.length}`);
  assert(contest.type === 'candidate');
  const contestResults = updatedResults.contestResults[contest.id];
  assert(contestResults.contestType === 'candidate');
  const inputs = [
    ['Overvotes', contestResults.overvotes],
    ['Undervotes', contestResults.undervotes],
    ...contest.candidates.map((candidate): [string, number] => [
      candidate.name,
      contestResults.tallies[candidate.id].tally,
    ]),
  ] as const;
  for (const [label, value] of inputs) {
    screen.getByText('Entered tallies do not match total ballots cast');
    const input = screen.getByLabelText(label);
    expect(input).toHaveValue(value);
    userEvent.clear(input);
    screen.getByText('Incomplete tallies');
    expect(screen.getButton('Save & Next')).toBeDisabled();
    userEvent.type(input, 'abc'); // Non-number shouldn't do anything
    userEvent.type(input, (value * 2).toString());
  }
  screen.getByText('Entered tallies are valid');

  updatedResults = {
    ...updatedResults,
    contestResults: {
      ...updatedResults.contestResults,
      [contest.id]: {
        ...contestResults,
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
  userEvent.click(screen.getButton('Save & Next'));
  await screen.findByText(`2 of ${contests.length}`);
});

test('adding new write-in candidates', async () => {
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetManualResults(identifier, mockValidResults);
  renderScreen({
    initialRoute: `/tally/manual/${ballotStyleGroupId}/${votingMethod}/${precinctId}/best-animal-mammal`,
  });

  // best animal mammal contest shouldn't allow a write-in
  await screen.findByRole('heading', { name: 'Best Animal' });
  expect(screen.queryByText('Add Write-In Candidate')).not.toBeInTheDocument();
  apiMock.expectSetManualResults({
    ...identifier,
    manualResults: mockValidResults,
  });
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetManualResults(identifier, mockValidResults);
  userEvent.click(screen.getButton('Save & Next'));

  // zoo council mammal contest should allow write-ins
  await screen.findByRole('heading', { name: 'Zoo Council' });
  userEvent.click(screen.getButton('Add Write-In Candidate'));
  const writeInInput = screen.getByLabelText('Write-in');
  expect(writeInInput).toHaveFocus();
  // Original button should have been replaced
  expect(screen.queryByText('Add Write-In Candidate')).not.toBeInTheDocument();
  // Enter should be disabled - we can tell since Add button is still around after Enter
  userEvent.type(writeInInput, '{enter}');
  // "Add" button should be disabled
  expect(screen.getButton('Add')).toBeDisabled();

  // Type in a pre-existing name
  userEvent.type(writeInInput, 'Zebra');
  // Enter should be disabled
  userEvent.type(writeInInput, '{enter}');
  // "Add" button should be disabled
  expect(screen.getButton('Add')).toBeDisabled();

  // Cancel, re-open, and add new
  userEvent.click(screen.getButton('Cancel'));
  userEvent.click(screen.getButton('Add Write-In Candidate'));
  userEvent.type(screen.getByLabelText('Write-in'), 'Mock Candidate');
  userEvent.click(screen.getButton('Add'));
  screen.getByText('Incomplete tallies');

  // Can add to new write-in candidate's count
  userEvent.type(screen.getByLabelText('Mock Candidate (write-in)'), '30');

  // Write-in counts affect validation
  screen.getByText('Entered tallies do not match total ballots cast');

  // Can remove our write-in
  userEvent.click(screen.getButton('Remove'));
  expect(
    screen.queryByText('Mock Candidate (write-in)')
  ).not.toBeInTheDocument();
  screen.getByText('Entered tallies are valid');

  // Add back the candidate and save
  userEvent.click(screen.getButton('Add Write-In Candidate'));
  // add using key "Enter" shortcut
  userEvent.type(screen.getByLabelText('Write-in'), 'Mock Candidate{enter}');
  userEvent.type(screen.getByLabelText('Mock Candidate (write-in)'), '10');

  // saves temp write-in candidate to backend
  assert(
    mockValidResults.contestResults['zoo-council-mammal'].contestType ===
      'candidate'
  );
  const updatedResults: Tabulation.ManualElectionResults = {
    ...mockValidResults,
    contestResults: {
      ...mockValidResults.contestResults,
      'zoo-council-mammal': {
        ...mockValidResults.contestResults['zoo-council-mammal'],
        tallies: {
          ...mockValidResults.contestResults['zoo-council-mammal'].tallies,
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
  userEvent.click(screen.getButton('Save & Next'));
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
  expect(writeInInput).toHaveValue(null);

  // Can edit
  userEvent.type(writeInInput, '30');
  expect(writeInInput).toHaveValue(30);

  const contestResults = mockValidResults.contestResults['zoo-council-mammal'];
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
  userEvent.click(screen.getButton('Save & Next'));
  await screen.findByText(`2 of ${contests.length}`);
});

test('previous/cancel button', async () => {
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetManualResults(identifier, mockValidResults);
  const { history } = renderScreen({
    initialRoute: `/tally/manual/${ballotStyleGroupId}/${votingMethod}/${precinctId}/${contests[0].id}`,
  });

  await screen.findByRole('heading', { name: contests[0].title });
  userEvent.click(screen.getButton('Previous'));

  await screen.findByLabelText('Total Ballots Cast');
  userEvent.click(screen.getButton('Cancel'));
  await waitFor(() =>
    expect(history.location.pathname).toEqual('/tally/manual')
  );
});

test('close button', async () => {
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetManualResults(identifier, undefined);
  const { history } = renderScreen();

  await screen.findByRole('heading', { name: 'Edit Tallies' });
  userEvent.click(screen.getButton('Close'));
  await waitFor(() =>
    expect(history.location.pathname).toEqual('/tally/manual')
  );
});

test('overriding ballot count for a contest', async () => {
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetManualResults(identifier, mockValidResults);
  renderScreen({
    initialRoute: `/tally/manual/${ballotStyleGroupId}/${votingMethod}/${precinctId}/${contests[0].id}`,
  });

  await screen.findByRole('heading', { name: contests[0].title });
  let ballotCountInput = screen.getByLabelText('Total Ballots Cast');
  expect(ballotCountInput).toHaveValue(mockValidResults.ballotCount);
  expect(ballotCountInput).toBeDisabled();

  userEvent.click(screen.getButton('Override'));
  expect(ballotCountInput).toBeEnabled();
  screen.getButton('Remove Override');

  userEvent.clear(ballotCountInput);
  screen.getByText('Incomplete tallies');
  expect(screen.getButton('Save & Next')).toBeDisabled();

  userEvent.type(
    ballotCountInput,
    (mockValidResults.ballotCount * 2).toString()
  );
  screen.getByText('Entered tallies do not match total ballots cast');

  const updatedResults: Tabulation.ManualElectionResults = {
    ...mockValidResults,
    contestResults: {
      ...mockValidResults.contestResults,
      [contests[0].id]: {
        ...mockValidResults.contestResults[contests[0].id],
        ballots: mockValidResults.ballotCount * 2,
      },
    },
  };
  apiMock.expectSetManualResults({
    ...identifier,
    manualResults: updatedResults,
  });
  apiMock.expectGetManualResults(identifier, updatedResults);
  apiMock.expectGetWriteInCandidates([]);
  userEvent.click(screen.getButton('Save & Next'));

  await screen.findByRole('heading', { name: contests[1].title });
  userEvent.click(screen.getButton('Previous'));

  await screen.findByRole('heading', { name: contests[0].title });
  ballotCountInput = screen.getByLabelText('Total Ballots Cast');
  expect(ballotCountInput).toHaveValue(mockValidResults.ballotCount * 2);
  expect(ballotCountInput).toBeEnabled();

  userEvent.click(screen.getButton('Remove Override'));
  expect(ballotCountInput).toHaveValue(mockValidResults.ballotCount);
  expect(ballotCountInput).toBeDisabled();
  screen.getByText('Entered tallies are valid');

  apiMock.expectSetManualResults({
    ...identifier,
    manualResults: mockValidResults,
  });
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetManualResults(identifier, mockValidResults);
  userEvent.click(screen.getButton('Save & Next'));
  await screen.findByRole('heading', { name: contests[1].title });
});

test('changing overall ballot count when there are overrides', async () => {
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetManualResults(identifier, {
    ...mockValidResults,
    contestResults: {
      ...mockValidResults.contestResults,
      [contests[0].id]: {
        ...mockValidResults.contestResults[contests[0].id],
        ballots: mockValidResults.ballotCount * 2,
      },
    },
  });
  renderScreen();

  const ballotCountInput = await screen.findByLabelText('Total Ballots Cast');
  expect(ballotCountInput).toHaveValue(mockValidResults.ballotCount);
  screen.getByText(
    'Changing the total ballots cast will remove contest overrides.'
  );
  userEvent.clear(ballotCountInput);
  expect(screen.getButton('Save & Next')).toBeDisabled();
  userEvent.type(
    ballotCountInput,
    (mockValidResults.ballotCount + 1).toString()
  );

  const updatedResults: Tabulation.ManualElectionResults = {
    ballotCount: mockValidResults.ballotCount + 1,
    contestResults: mapObject(
      mockValidResults.contestResults,
      (contestResults) => ({
        ...contestResults,
        ballots: mockValidResults.ballotCount + 1,
      })
    ),
  };
  apiMock.expectSetManualResults({
    ...identifier,
    manualResults: updatedResults,
  });
  apiMock.expectGetManualResults(identifier, updatedResults);
  apiMock.expectGetWriteInCandidates([]);
  userEvent.click(screen.getButton('Save & Next'));

  await screen.findByRole('heading', { name: contests[0].title });
  expect(screen.getByLabelText('Total Ballots Cast')).toHaveValue(
    mockValidResults.ballotCount + 1
  );
  expect(screen.getByLabelText('Total Ballots Cast')).toBeDisabled();
});
