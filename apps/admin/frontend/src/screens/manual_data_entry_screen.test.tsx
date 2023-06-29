import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import { Route } from 'react-router-dom';

import { getBallotStyle, getContests } from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { buildManualResultsFixture } from '@votingworks/utils';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { screen, within } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ManualDataEntryScreen } from './manual_data_entry_screen';
import { ApiMock, createApiMock } from '../../test/helpers/api_mock';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

const electionDefinition = electionMinimalExhaustiveSampleDefinition;
const { election } = electionDefinition;

const mockValidResults = buildManualResultsFixture({
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

test('displays correct contests for ballot style', async () => {
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetManualResults({
    ballotStyleId: '1M',
    votingMethod: 'absentee',
    precinctId: 'precinct-1',
  });
  renderInAppContext(
    <Route path="/tally/manual-data-entry/:ballotStyleId/:votingMethod/:precinctId">
      <ManualDataEntryScreen />
    </Route>,
    {
      route: '/tally/manual-data-entry/1M/absentee/precinct-1',
      electionDefinition,
      apiMock,
    }
  );

  await screen.findByText('Enter the number of votes for each contest option.');
  screen.getByText(
    hasTextAcrossElements(
      'Ballot Style: 1M | Precinct: Precinct 1 | Voting Method: Absentee'
    )
  );

  // has sections for each of the expected contests and no more
  const expectedContests = getContests({
    election,
    ballotStyle: getBallotStyle({ election, ballotStyleId: '1M' })!,
  });
  for (const contest of expectedContests) {
    screen.getByTestId(`${contest.id}-numBallots-input`);
  }
  expect(screen.getAllByTestId(/-numBallots-input/)).toHaveLength(
    expectedContests.length
  );

  // check either-neither contest titles - adds party or either-neither
});

test('can edit counts, receive validation messages, and save', async () => {
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetManualResults({
    ballotStyleId: '1M',
    votingMethod: 'absentee',
    precinctId: 'precinct-1',
  });
  renderInAppContext(
    <Route path="/tally/manual-data-entry/:ballotStyleId/:votingMethod/:precinctId">
      <ManualDataEntryScreen />
    </Route>,
    {
      route: '/tally/manual-data-entry/1M/absentee/precinct-1',
      electionDefinition,
      apiMock,
    }
  );

  await screen.findByText('Enter the number of votes for each contest option.');

  // Test that inputs behave as expected
  const testInputId = 'best-animal-mammal-numBallots-input';
  // Input elements start as 0
  expect(screen.getByTestId(testInputId).closest('input')!.value).toEqual('0');
  // We can not change the input to a non number
  userEvent.type(screen.getByTestId(testInputId).closest('input')!, 'daylight');
  expect(screen.getByTestId(testInputId).closest('input')!.value).toEqual('0');
  // We can change the input to an empty string
  userEvent.type(
    screen.getByTestId(testInputId).closest('input')!,
    '{backspace}'
  );
  expect(screen.getByTestId(testInputId).closest('input')!.value).toEqual('');

  // Initial validation shows that results are empty
  const bestAnimalTable = screen.getByTestId(testInputId).closest('table')!;
  within(bestAnimalTable).getByText('No results entered');
  screen.getByText('At least one contest above has no results entered');

  // while results are incomplete, we should get validation warning
  userEvent.type(
    screen.getByTestId('best-animal-mammal-numBallots-input'),
    '10'
  );
  within(bestAnimalTable).getByText(
    'Entered results do not match total ballots cast'
  );
  screen.getByText('At least one contest above has invalid results entered');

  // finish entering results for current contest
  userEvent.type(screen.getByTestId('best-animal-mammal-overvotes-input'), '1');
  userEvent.type(
    screen.getByTestId('best-animal-mammal-undervotes-input'),
    '3'
  );
  userEvent.type(screen.getByTestId('best-animal-mammal-horse-input'), '2');
  userEvent.type(screen.getByTestId('best-animal-mammal-otter-input'), '2');
  userEvent.type(screen.getByTestId('best-animal-mammal-fox-input'), '2');

  // validation should be successful
  within(bestAnimalTable).getByText('Entered results are valid');

  // fill out the rest of the form with valid results, covering yes no contests
  const resultsToEnter: Array<[string, string, string]> = [
    ['zoo-council-mammal', 'numBallots', '10'],
    ['zoo-council-mammal', 'overvotes', '6'],
    ['zoo-council-mammal', 'undervotes', '4'],
    ['zoo-council-mammal', 'zebra', '5'],
    ['zoo-council-mammal', 'lion', '5'],
    ['zoo-council-mammal', 'kangaroo', '5'],
    ['zoo-council-mammal', 'elephant', '5'],
    ['new-zoo-either', 'numBallots', '10'],
    ['new-zoo-either', 'overvotes', '2'],
    ['new-zoo-either', 'undervotes', '2'],
    ['new-zoo-either', 'yes', '3'],
    ['new-zoo-either', 'no', '3'],
    ['new-zoo-pick', 'numBallots', '10'],
    ['new-zoo-pick', 'overvotes', '2'],
    ['new-zoo-pick', 'undervotes', '2'],
    ['new-zoo-pick', 'yes', '3'],
    ['new-zoo-pick', 'no', '3'],
    ['fishing', 'numBallots', '10'],
    ['fishing', 'overvotes', '2'],
    ['fishing', 'undervotes', '2'],
    ['fishing', 'yes', '3'],
    ['fishing', 'no', '3'],
  ];

  for (const resultToEnter of resultsToEnter) {
    userEvent.type(
      screen.getByTestId(`${resultToEnter[0]}-${resultToEnter[1]}-input`),
      resultToEnter[2]
    );
  }

  await screen.findByText('All entered contest results are valid');

  apiMock.expectSetManualResults({
    ballotStyleId: '1M',
    precinctId: 'precinct-1',
    votingMethod: 'absentee',
    manualResults: mockValidResults,
  });
  userEvent.click(screen.getButton('Save Results'));
});

test('loads pre-existing manual data to edit', async () => {
  apiMock.expectGetWriteInCandidates([]);
  // have an initial tally from backend
  apiMock.expectGetManualResults(
    {
      ballotStyleId: '1M',
      votingMethod: 'absentee',
      precinctId: 'precinct-1',
    },
    mockValidResults
  );
  renderInAppContext(
    <Route path="/tally/manual-data-entry/:ballotStyleId/:votingMethod/:precinctId">
      <ManualDataEntryScreen />
    </Route>,
    {
      route: '/tally/manual-data-entry/1M/absentee/precinct-1',
      electionDefinition,
      apiMock,
    }
  );

  await screen.findByText('Enter the number of votes for each contest option.');

  // check one contest's data
  expect(
    screen.getByTestId('best-animal-mammal-numBallots-input').closest('input')!
      .value
  ).toEqual('10');
  expect(
    screen.getByTestId('best-animal-mammal-undervotes-input').closest('input')!
      .value
  ).toEqual('3');
  expect(
    screen.getByTestId('best-animal-mammal-overvotes-input').closest('input')!
      .value
  ).toEqual('1');
  expect(
    screen.getByTestId('best-animal-mammal-horse-input').closest('input')!.value
  ).toEqual('2');
  expect(
    screen.getByTestId('best-animal-mammal-fox-input').closest('input')!.value
  ).toEqual('2');
  expect(
    screen.getByTestId('best-animal-mammal-otter-input').closest('input')!.value
  ).toEqual('2');

  // validation should be good
  screen.getByText('All entered contest results are valid');
  expect(screen.getAllByText('Entered results are valid')).toHaveLength(5);
});

test('adding new write-in candidates', async () => {
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetManualResults({
    ballotStyleId: '1M',
    votingMethod: 'precinct',
    precinctId: 'precinct-1',
  });
  renderInAppContext(
    <Route path="/tally/manual-data-entry/:ballotStyleId/:votingMethod/:precinctId">
      <ManualDataEntryScreen />
    </Route>,
    {
      route: '/tally/manual-data-entry/1M/precinct/precinct-1',
      electionDefinition,
      apiMock,
    }
  );

  await screen.findByText('Enter the number of votes for each contest option.');

  // best animal mammal contest shouldn't allow a write-in
  const bestAnimalMammal = screen
    .getByTestId('best-animal-mammal-numBallots-input')
    .closest('table')!;
  expect(
    within(bestAnimalMammal).queryByText('Add Write-In Candidate')
  ).not.toBeInTheDocument();

  // zoo council mammal contest should allow write-ins
  const zooCouncilMammal = screen
    .getByTestId('zoo-council-mammal-numBallots-input')
    .closest('table')!;
  userEvent.click(within(zooCouncilMammal).getButton('Add Write-In Candidate'));
  // Original button should have been replaced
  expect(
    within(zooCouncilMammal).queryByText('Add Write-In Candidate')
  ).not.toBeInTheDocument();
  // "Add" button should be disabled without anything entered
  expect(within(zooCouncilMammal).getButton('Add')).toBeDisabled();
  // "Add button should be disabled if an entry is an existing name"
  userEvent.type(
    within(zooCouncilMammal).getByTestId('zoo-council-mammal-write-in-input'),
    'Zebra'
  );
  expect(within(zooCouncilMammal).getButton('Add')).toBeDisabled();
  // Cancel, re-open, and add new
  userEvent.click(within(zooCouncilMammal).getByText('Cancel'));
  userEvent.click(within(zooCouncilMammal).getByText('Add Write-In Candidate'));
  userEvent.type(
    within(zooCouncilMammal).getByTestId('zoo-council-mammal-write-in-input'),
    'Mock Candidate'
  );
  userEvent.click(within(zooCouncilMammal).getByText('Add'));
  // Button should re-appear, allowing us to add more
  within(zooCouncilMammal).getByText('Add Write-In Candidate');
  await screen.findByText('Mock Candidate (write-in)');

  // Can add to new write-in candidate's count
  userEvent.type(
    screen.getByTestId(
      'zoo-council-mammal-temp-write-in-(Mock Candidate)-input'
    ),
    '30'
  );

  // Write-in counts affect validation
  await within(zooCouncilMammal).findByText(
    'Entered results do not match total ballots cast'
  );
  userEvent.type(
    screen.getByTestId('zoo-council-mammal-numBallots-input'),
    '10'
  );
  await within(zooCouncilMammal).findByText('Entered results are valid');

  // Can remove our write-in
  userEvent.click(within(zooCouncilMammal).getByText('Remove'));
  expect(
    screen.queryByTestId('temp-write-in-(Mock Candidate)')
  ).not.toBeInTheDocument();
  await within(zooCouncilMammal).findByText(
    'Entered results do not match total ballots cast'
  );

  // Add back the candidate and save
  userEvent.click(within(zooCouncilMammal).getButton('Add Write-In Candidate'));
  // add using key "Enter" shortcut
  userEvent.type(
    within(zooCouncilMammal).getByTestId('zoo-council-mammal-write-in-input'),
    'Mock Candidate{enter}'
  );
  userEvent.type(
    screen.getByTestId(
      'zoo-council-mammal-temp-write-in-(Mock Candidate)-input'
    ),
    '30'
  );
  await within(zooCouncilMammal).findByText('Entered results are valid');

  // saves temp write-in candidate to backend
  apiMock.expectSetManualResults({
    ballotStyleId: '1M',
    precinctId: 'precinct-1',
    votingMethod: 'precinct',
    manualResults: buildManualResultsFixture({
      election,
      ballotCount: 10,
      contestResultsSummaries: {
        'zoo-council-mammal': {
          type: 'candidate',
          ballots: 10,
          overvotes: 0,
          undervotes: 0,
          writeInOptionTallies: {
            'temp-write-in-(Mock Candidate)': {
              name: 'Mock Candidate',
              tally: 30,
            },
          },
        },
      },
    }),
  });
  userEvent.click(screen.getButton('Save Results'));
});

test('loads existing write-in candidates', async () => {
  // Set up an existing adjudicated value
  apiMock.expectGetWriteInCandidates([
    {
      electionId: 'uuid',
      contestId: 'zoo-council-mammal',
      name: 'Chimera',
      id: 'chimera',
    },
  ]);

  apiMock.expectGetManualResults(
    {
      ballotStyleId: '1M',
      votingMethod: 'precinct',
      precinctId: 'precinct-1',
    },
    buildManualResultsFixture({
      election,
      ballotCount: 10,
      contestResultsSummaries: {
        'zoo-council-mammal': {
          type: 'candidate',
          ballots: 10,
          overvotes: 0,
          undervotes: 0,
          writeInOptionTallies: {
            chimera: {
              name: 'Chimera',
              tally: 30,
            },
          },
        },
      },
    })
  );
  renderInAppContext(
    <Route path="/tally/manual-data-entry/:ballotStyleId/:votingMethod/:precinctId">
      <ManualDataEntryScreen />
    </Route>,
    {
      route: '/tally/manual-data-entry/1M/precinct/precinct-1',
      electionDefinition,
      apiMock,
    }
  );

  await screen.findByText('Enter the number of votes for each contest option.');

  // Adjudicated value should be in the form and not be removable
  await screen.findByText('Chimera (write-in)');
  expect(screen.queryByText('Remove')).not.toBeInTheDocument();

  // Loads pre-existing value
  expect(
    screen.getByTestId('zoo-council-mammal-chimera-input').closest('input')!
      .value
  ).toEqual('30');

  // Can edit
  userEvent.type(
    screen.getByTestId('zoo-council-mammal-chimera-input'),
    '{backspace}{backspace}0'
  );
  expect(
    screen.getByTestId('zoo-council-mammal-chimera-input').closest('input')!
      .value
  ).toEqual('0');
});
