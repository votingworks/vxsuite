import React from 'react';
import {
  electionWithMsEitherNeitherDefinition,
  electionSampleDefinition,
  electionMinimalExhaustiveSampleDefinition,
} from '@votingworks/fixtures';
import { Route } from 'react-router-dom';

import {
  FullElectionManualTally,
  TallyCategory,
  VotingMethod,
} from '@votingworks/types';
import { fakeLogger } from '@votingworks/logging';
import userEvent from '@testing-library/user-event';
import { assert, sleep } from '@votingworks/basics';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import {
  getEmptyManualTalliesByPrecinct,
  getEmptyManualTally,
} from '../utils/manual_tallies';
import { ManualDataImportPrecinctScreen } from './manual_data_import_precinct_screen';
import {
  buildManualTally,
  buildSpecifiedManualTally,
} from '../../test/helpers/build_manual_tally';
import { ApiMock, createApiMock } from '../../test/helpers/api_mock';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('displays error screen for invalid precinct', async () => {
  apiMock.expectGetWriteInCandidates([]);
  renderInAppContext(
    <Route path="/tally/manual-data-import/precinct/:precinctId">
      <ManualDataImportPrecinctScreen />
    </Route>,
    {
      route: '/tally/manual-data-import/precinct/12345',
      electionDefinition: electionWithMsEitherNeitherDefinition,
      apiMock,
    }
  );
  await screen.findByText('Error: Could not find precinct 12345.');
  screen.getByText('Back to Index');
  // There's no change in the invalid precinct case after the writeInQuery
  // fires, so we just have to wait to avoid a test warning.
  // TODO: Remove after upgrade to React 18, which does not warn in this case.
  await act(async () => {
    await sleep(1);
  });
});

test('displays correct contests for each precinct', async () => {
  const updateManualTally = jest.fn();
  const commissionerRaces = [
    'Election Commissioner 01',
    'Election Commissioner 02',
    'Election Commissioner 03',
    'Election Commissioner 04',
    'Election Commissioner 05',
  ];
  const testcases = [
    {
      precinctId: '6538',
      precinctName: 'Bywy',
      expectedCommissionerRace: commissionerRaces[0],
    },
    {
      precinctId: '6528',
      precinctName: 'Hebron',
      expectedCommissionerRace: commissionerRaces[1],
    },
    {
      precinctId: '6539',
      precinctName: 'West Weir',
      expectedCommissionerRace: commissionerRaces[2],
    },
    {
      precinctId: '6532',
      precinctName: 'Panhandle',
      expectedCommissionerRace: commissionerRaces[3],
    },
    {
      precinctId: '6522',
      precinctName: 'District 5',
      expectedCommissionerRace: commissionerRaces[4],
    },
  ];

  for (const {
    precinctId,
    precinctName,
    expectedCommissionerRace,
  } of testcases) {
    apiMock.expectGetWriteInCandidates([]);
    const { unmount } = renderInAppContext(
      <Route path="/tally/manual-data-import/precinct/:precinctId">
        <ManualDataImportPrecinctScreen />
      </Route>,
      {
        route: `/tally/manual-data-import/precinct/${precinctId}`,
        electionDefinition: electionWithMsEitherNeitherDefinition,
        updateManualTally,
        apiMock,
      }
    );
    await screen.findByText('Manually Entered Results:');
    screen.getByText(`Save Results for ${precinctName}`);

    // All precincts have the president contest
    screen.getByText('President');
    // Check that only the expected election commissioner race is shown (the title is shown twice as the section and contest title)
    for (const raceName of commissionerRaces) {
      expect(screen.queryAllByText(raceName)).toHaveLength(
        raceName === expectedCommissionerRace ? 2 : 0
      );
    }

    unmount();
  }
});

test('can edit counts and update totals', async () => {
  const logger = fakeLogger();
  apiMock.expectGetWriteInCandidates([]);
  renderInAppContext(
    <Route path="/tally/manual-data-import/precinct/:precinctId">
      <ManualDataImportPrecinctScreen />
    </Route>,
    {
      route: '/tally/manual-data-import/precinct/23',
      electionDefinition: electionSampleDefinition,
      logger,
      apiMock,
    }
  );
  await screen.findByText('Manually Entered Results:');
  screen.getByText('Center Springfield');

  // Input elements start as 0
  expect(
    screen.getByTestId('president-undervotes-input').closest('input')!.value
  ).toEqual('0');

  // We can not change the input to a non number
  userEvent.type(
    screen.getByTestId('president-undervotes-input').closest('input')!,
    'daylight'
  );
  expect(
    screen.getByTestId('president-undervotes-input').closest('input')!.value
  ).toEqual('0');

  // We can change the input to an empty string
  userEvent.type(
    screen.getByTestId('president-undervotes-input').closest('input')!,
    '{backspace}'
  );
  expect(
    screen.getByTestId('president-undervotes-input').closest('input')!.value
  ).toEqual('');

  // We can change the input to a number
  userEvent.type(
    screen.getByTestId('president-undervotes-input').closest('input')!,
    '4'
  );
  expect(
    screen.getByTestId('president-undervotes-input').closest('input')!.value
  ).toEqual('4');

  userEvent.type(
    screen.getByTestId('president-overvotes-input').closest('input')!,
    '6'
  );
  userEvent.type(
    screen.getByTestId('president-barchi-hallaren-input').closest('input')!,
    '10'
  );
  userEvent.type(
    screen.getByTestId('president-cramer-vuocolo-input').closest('input')!,
    '20'
  );
  userEvent.type(
    screen.getByTestId('president-court-blumhardt-input').closest('input')!,
    '35'
  );
  userEvent.type(
    screen.getByTestId('president-boone-lian-input').closest('input')!,
    '25'
  );

  // Contest total ballots now should be updated
  await waitFor(() => {
    expect(screen.getByTestId('president-numBallots').textContent).toEqual(
      '100'
    );
  });

  // build expected tally
  const expectedTally = buildSpecifiedManualTally(
    electionSampleDefinition.election,
    100,
    {
      president: {
        overvotes: 6,
        undervotes: 4,
        ballots: 100,
        officialOptionTallies: {
          'barchi-hallaren': 10,
          'cramer-vuocolo': 20,
          'court-blumhardt': 35,
          'boone-lian': 25,
        },
      },
    }
  );

  apiMock.expectSetManualTally({
    precinctId: '23',
    manualTally: expectedTally,
  });
  userEvent.click(screen.getByText('Save Results for Center Springfield'));
});

test('can add and remove a write-in candidate when contest allows', async () => {
  apiMock.expectGetWriteInCandidates([]);
  renderInAppContext(
    <Route path="/tally/manual-data-import/precinct/:precinctId">
      <ManualDataImportPrecinctScreen />
    </Route>,
    {
      route: '/tally/manual-data-import/precinct/23',
      electionDefinition: electionSampleDefinition,
      apiMock,
    }
  );
  await screen.findByText('Manually Entered Results:');
  screen.getByText('Center Springfield');

  // President contest shouldn't allow a write-in
  const presidentContest = screen
    .getByText('President and Vice-President')
    .closest('div');
  assert(presidentContest);
  expect(
    within(presidentContest).queryByText('Add Write-In Candidate')
  ).not.toBeInTheDocument();

  // County Commissioners contest should allow write-ins
  const commissionerContest = screen
    .getByText('County Commissioners')
    .closest('div');
  assert(commissionerContest);
  userEvent.click(
    within(commissionerContest).getByText('Add Write-In Candidate')
  );
  // Original button should have been replaced
  expect(
    within(commissionerContest).queryByText('Add Write-In Candidate')
  ).not.toBeInTheDocument();
  // "Add" button should be disabled without anything entered
  expect(within(commissionerContest).getButton('Add')).toBeDisabled();
  // "Add button should be disabled if an entry is an existing name"
  userEvent.type(
    within(commissionerContest).getByTestId(
      'county-commissioners-write-in-input'
    ),
    'Camille Argent'
  );
  expect(within(commissionerContest).getButton('Add')).toBeDisabled();
  // Cancel, re-open, and add new
  userEvent.click(within(commissionerContest).getByText('Cancel'));
  userEvent.click(
    within(commissionerContest).getByText('Add Write-In Candidate')
  );
  userEvent.type(
    within(commissionerContest).getByTestId(
      'county-commissioners-write-in-input'
    ),
    'Fake Candidate'
  );
  userEvent.click(within(commissionerContest).getByText('Add'));
  // Button should re-appear, allowing us to add more
  within(commissionerContest).getByText('Add Write-In Candidate');
  await screen.findByText('Fake Candidate (write-in)');

  // Can add to new write-in candidate's count
  userEvent.type(
    screen.getByTestId(
      'county-commissioners-temp-write-in-(Fake Candidate)-input'
    ),
    '10'
  );
  // Updating write-in value updates contest total
  await waitFor(() => {
    expect(
      screen.getByTestId('county-commissioners-numBallots').textContent
    ).toEqual('3'); // multi-seat contest calculation, ceil(10 / 4)
  });

  // Can remove our write-in
  userEvent.click(within(commissionerContest).getByText('Remove'));
  expect(
    screen.queryByTestId('temp-write-in-(Fake Candidate)')
  ).not.toBeInTheDocument();
  // Totals should be adjusted
  expect(
    screen.getByTestId('county-commissioners-numBallots').textContent
  ).toEqual('0');
});

test('loads already added write-in candidates values', async () => {
  // Set up an existing adjudicated value
  apiMock.expectGetWriteInCandidates([
    {
      electionId: 'uuid',
      contestId: 'zoo-council-mammal',
      name: 'Chimera',
      id: 'uuid',
    },
  ]);

  renderInAppContext(
    <Route path="/tally/manual-data-import/precinct/:precinctId">
      <ManualDataImportPrecinctScreen />
    </Route>,
    {
      route: '/tally/manual-data-import/precinct/precinct-1',
      electionDefinition: electionMinimalExhaustiveSampleDefinition,
      apiMock,
    }
  );

  // Adjudicated value should be in the form and not be removable
  await screen.findByText('Chimera (write-in)');
  expect(screen.queryByText('Remove')).not.toBeInTheDocument();
});

test('can enter data for yes no contests as expected', async () => {
  apiMock.expectGetWriteInCandidates([]);
  const updateManualTally = jest.fn();
  const logger = fakeLogger();
  renderInAppContext(
    <Route path="/tally/manual-data-import/precinct/:precinctId">
      <ManualDataImportPrecinctScreen />
    </Route>,
    {
      route: '/tally/manual-data-import/precinct/23',
      updateManualTally,
      electionDefinition: electionSampleDefinition,
      logger,
      apiMock,
    }
  );
  await screen.findByText('Manually Entered Results:');
  screen.getByText('Center Springfield');

  // Input elements start as 0
  expect(
    screen.getByTestId('judicial-robert-demergue-yes-input').closest('input')!
      .value
  ).toEqual('0');
  // We can not change the input to a non number
  fireEvent.change(
    screen.getByTestId('judicial-robert-demergue-yes-input').closest('input')!,
    {
      target: { value: 'daylight' },
    }
  );
  expect(
    screen.getByTestId('judicial-robert-demergue-yes-input').closest('input')!
      .value
  ).toEqual('0');

  // We can change the input to a number
  fireEvent.change(
    screen.getByTestId('judicial-robert-demergue-yes-input').closest('input')!,
    {
      target: { value: '50' },
    }
  );
  expect(
    screen.getByTestId('judicial-robert-demergue-yes-input').closest('input')!
      .value
  ).toEqual('50');
  fireEvent.change(
    screen
      .getByTestId('judicial-robert-demergue-undervotes-input')
      .closest('input')!,
    {
      target: { value: '4' },
    }
  );
  fireEvent.change(
    screen
      .getByTestId('judicial-robert-demergue-overvotes-input')
      .closest('input')!,
    {
      target: { value: '6' },
    }
  );
  fireEvent.change(
    screen.getByTestId('judicial-robert-demergue-no-input').closest('input')!,
    {
      target: { value: '40' },
    }
  );

  // A yes no contest does not allow write ins so has no write in row.
  expect(screen.queryAllByTestId('president-write-in').length).toEqual(0);
  const expectedTally = buildSpecifiedManualTally(
    electionSampleDefinition.election,
    100,
    {
      'judicial-robert-demergue': {
        undervotes: 4,
        overvotes: 6,
        ballots: 100,
        officialOptionTallies: {
          yes: 50,
          no: 40,
        },
      },
    }
  );
  apiMock.expectSetManualTally({
    precinctId: '23',
    manualTally: expectedTally,
  });
  fireEvent.click(screen.getByText('Save Results for Center Springfield'));
});

test('loads preexisting manual data to edit', async () => {
  apiMock.expectGetWriteInCandidates([]);
  const { election } = electionSampleDefinition;
  const talliesByPrecinct = getEmptyManualTalliesByPrecinct(election);
  talliesByPrecinct['23'] = buildManualTally(election, 1, [
    'county-commissioners',
    'judicial-robert-demergue',
  ]);
  talliesByPrecinct['20'] = buildManualTally(election, 1, [
    'primary-constitution-head-of-party',
  ]);

  const resultsByCategory = new Map();
  resultsByCategory.set(TallyCategory.Precinct, talliesByPrecinct);
  const manualTally: FullElectionManualTally = {
    overallTally: getEmptyManualTally(),
    resultsByCategory,
    votingMethod: VotingMethod.Absentee,
    timestampCreated: new Date(),
  };

  const updateManualTally = jest.fn();
  renderInAppContext(
    <Route path="/tally/manual-data-import/precinct/:precinctId">
      <ManualDataImportPrecinctScreen />
    </Route>,
    {
      route: '/tally/manual-data-import/precinct/23',
      updateManualTally,
      manualTallyVotingMethod: VotingMethod.Precinct,
      electionDefinition: electionSampleDefinition,
      fullElectionManualTally: manualTally,
      apiMock,
    }
  );
  await screen.findByText('Manually Entered Results:');

  // Check contests with mock data
  expect(
    screen.getByTestId('county-commissioners-numBallots')
  ).toHaveTextContent('13');
  expect(
    screen
      .getByTestId('county-commissioners-undervotes-input')
      .closest('input')!.value
  ).toEqual('4');
  expect(
    screen.getByTestId('county-commissioners-overvotes-input').closest('input')!
      .value
  ).toEqual('4');
  expect(
    screen.getByTestId('county-commissioners-argent-input').closest('input')!
      .value
  ).toEqual('4');

  expect(
    screen.getByTestId('judicial-robert-demergue-numBallots')
  ).toHaveTextContent('4');
  expect(
    screen
      .getByTestId('judicial-robert-demergue-undervotes-input')
      .closest('input')!.value
  ).toEqual('1');
  expect(
    screen
      .getByTestId('judicial-robert-demergue-overvotes-input')
      .closest('input')!.value
  ).toEqual('1');
  expect(
    screen.getByTestId('judicial-robert-demergue-yes-input').closest('input')!
      .value
  ).toEqual('1');
  expect(
    screen.getByTestId('judicial-robert-demergue-no-input').closest('input')!
      .value
  ).toEqual('1');
});
