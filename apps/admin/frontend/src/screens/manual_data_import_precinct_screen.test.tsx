import React from 'react';
import {
  electionWithMsEitherNeitherDefinition,
  electionSampleDefinition,
  electionMinimalExhaustiveSampleDefinition,
  electionMinimalExhaustiveSampleFixtures,
} from '@votingworks/fixtures';
import { Route } from 'react-router-dom';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';

import {
  ExternalTallySourceType,
  FullElectionExternalTally,
  getContests,
  safeParseInt,
  TallyCategory,
  VotingMethod,
} from '@votingworks/types';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import userEvent from '@testing-library/user-event';
import { assert, sleep } from '@votingworks/basics';
import { renderInAppContext } from '../../test/render_in_app_context';
import {
  getEmptyExternalTalliesByPrecinct,
  getEmptyExternalTally,
} from '../utils/external_tallies';
import { ManualDataImportPrecinctScreen } from './manual_data_import_precinct_screen';
import { buildExternalTally } from '../../test/helpers/build_external_tally';
import { ElectionManagerStoreMemoryBackend } from '../lib/backends';

test('displays error screen for invalid precinct', async () => {
  renderInAppContext(
    <Route path="/tally/manual-data-import/precinct/:precinctId">
      <ManualDataImportPrecinctScreen />
    </Route>,
    {
      route: '/tally/manual-data-import/precinct/12345',
      electionDefinition: electionWithMsEitherNeitherDefinition,
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
  const updateExternalTally = jest.fn();
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
    const { unmount } = renderInAppContext(
      <Route path="/tally/manual-data-import/precinct/:precinctId">
        <ManualDataImportPrecinctScreen />
      </Route>,
      {
        route: `/tally/manual-data-import/precinct/${precinctId}`,
        electionDefinition: electionWithMsEitherNeitherDefinition,
        updateExternalTally,
      }
    );
    await screen.findByText('Manually Entered Precinct Results:');
    screen.getByText(`Save Precinct Results for ${precinctName}`);

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
  const updateExternalTally = jest.fn();
  const logger = fakeLogger();
  renderInAppContext(
    <Route path="/tally/manual-data-import/precinct/:precinctId">
      <ManualDataImportPrecinctScreen />
    </Route>,
    {
      route: '/tally/manual-data-import/precinct/23',
      updateExternalTally,
      electionDefinition: electionSampleDefinition,
      logger,
    }
  );
  await screen.findByText('Manually Entered Precinct Results:');
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

  // In order to make the results consistent, we need to set the same number of
  // ballots for all contests on the given ballot style
  const { election } = electionSampleDefinition;
  const ballotStyle = election.ballotStyles[0];
  const contests = getContests({ ballotStyle, election });
  assert(contests.some((c) => c.id === 'president'));
  for (const contest of contests) {
    if (contest.id === 'president') continue;
    userEvent.type(
      screen.getByTestId(`${contest.id}-undervotes-input`).closest('input')!,
      contest.type === 'candidate' ? String(100 * contest.seats) : '100'
    );
    await waitFor(() => {
      expect(
        screen.getByTestId(`${contest.id}-numBallots`).textContent
      ).toEqual('100');
    });
  }

  userEvent.click(
    screen.getByText('Save Precinct Results for Center Springfield')
  );
  await waitFor(() =>
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.ManualTallyDataEdited,
      'election_manager',
      expect.objectContaining({ disposition: 'success' })
    )
  );
  expect(updateExternalTally).toHaveBeenCalledTimes(1);
  expect(updateExternalTally).toHaveBeenCalledWith(
    expect.objectContaining({
      overallTally: {
        numberOfBallotsCounted: 100,
        contestTallies: expect.objectContaining({
          president: expect.objectContaining({
            metadata: { ballots: 100, undervotes: 4, overvotes: 6 },
            tallies: {
              'barchi-hallaren': expect.objectContaining({ tally: 10 }),
              'cramer-vuocolo': expect.objectContaining({ tally: 20 }),
              'court-blumhardt': expect.objectContaining({ tally: 35 }),
              'boone-lian': expect.objectContaining({ tally: 25 }),
              'hildebrand-garritty': expect.objectContaining({ tally: 0 }),
              'patterson-lariviere': expect.objectContaining({ tally: 0 }),
            },
          }),
        }),
      },
    })
  );
});

test('can add and remove a write-in candidate when contest allows', async () => {
  renderInAppContext(
    <Route path="/tally/manual-data-import/precinct/:precinctId">
      <ManualDataImportPrecinctScreen />
    </Route>,
    {
      route: '/tally/manual-data-import/precinct/23',
      electionDefinition: electionSampleDefinition,
    }
  );
  await screen.findByText('Manually Entered Precinct Results:');
  screen.getByText('Center Springfield');

  // President contest shouldn't allow a write-in
  const presidentContest = screen
    .getByText('President and Vice-President')
    .closest('div');
  expect(
    within(presidentContest!).queryByText('Add Write-In Candidate')
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
  expect(within(commissionerContest).getByText('Add')).toBeDisabled();
  // "Add button should be disabled if an entry is an existing name"
  userEvent.type(
    within(commissionerContest).getByTestId(
      'county-commissioners-write-in-input'
    ),
    'Camille Argent'
  );
  expect(within(commissionerContest).getByText('Add')).toBeDisabled();
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
  // Can add to new write-in candidate's count
  userEvent.type(
    screen.getByTestId(
      'county-commissioners-write-in-(Fake Candidate)-manual-input'
    ),
    '10'
  );
  // Updating write-in value updates contest total
  expect(
    screen.getByTestId('county-commissioners-numBallots').textContent
  ).toEqual('3'); // multi-seat contest calculation, ceil(10 / 4)
  // Can remove our write-in
  userEvent.click(within(commissionerContest).getByText('Remove'));
  let modal = screen.getByRole('alertdialog');
  userEvent.click(within(modal).getByText('Cancel')); // Can cancel
  userEvent.click(within(commissionerContest).getByText('Remove'));
  modal = screen.getByRole('alertdialog');
  within(modal).getByText('Fake Candidate');
  userEvent.click(within(modal).getByText('Remove Candidate'));
  // Row should be gone
  expect(
    screen.queryByTestId(
      'county-commissioners-write-in-(Fake Candidate)-manual-input'
    )
  ).not.toBeInTheDocument();
  // Totals should be adjusted
  expect(
    screen.getByTestId('county-commissioners-numBallots').textContent
  ).toEqual('0'); // multi-seat contest calculation, ceil(10 / 4)
});

test('loads pre-adjudicated write-in values', async () => {
  // Set up an existing adjudicated value
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
  });
  await backend.addCastVoteRecordFile(
    new File(
      [electionMinimalExhaustiveSampleFixtures.partial1CvrFile.asBuffer()],
      'partial1.jsonl'
    )
  );
  const writeIn = (
    await backend.loadWriteIns({
      contestId: 'zoo-council-mammal',
    })
  )[0];
  await backend.transcribeWriteIn(writeIn.id, 'Chimera');
  await backend.adjudicateWriteInTranscription(
    'zoo-council-mammal',
    'Chimera',
    'Chimera'
  );

  renderInAppContext(
    <Route path="/tally/manual-data-import/precinct/:precinctId">
      <ManualDataImportPrecinctScreen />
    </Route>,
    {
      route: '/tally/manual-data-import/precinct/precinct-1',
      electionDefinition: electionMinimalExhaustiveSampleDefinition,
      backend,
    }
  );

  // Adjudicated value should be in the form and not be removable
  await screen.findByText('Chimera (write-in)');
  expect(screen.queryByText('Remove')).not.toBeInTheDocument();
});

test('can enter data for yes no contests as expected', async () => {
  const updateExternalTally = jest.fn();
  const logger = fakeLogger();
  renderInAppContext(
    <Route path="/tally/manual-data-import/precinct/:precinctId">
      <ManualDataImportPrecinctScreen />
    </Route>,
    {
      route: '/tally/manual-data-import/precinct/23',
      updateExternalTally,
      electionDefinition: electionSampleDefinition,
      logger,
    }
  );
  await screen.findByText('Manually Entered Precinct Results:');
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

  // A yes no contest does not allow write ins has no write in row.
  expect(screen.queryAllByTestId('president-write-in').length).toEqual(0);

  // In order to make the results consistent, we need to set the same number of
  // ballots for all contests on the given ballot style
  const totalBallots = safeParseInt(
    screen.getByTestId('judicial-robert-demergue-numBallots').textContent
  ).unsafeUnwrap();
  const { election } = electionSampleDefinition;
  const ballotStyle = election.ballotStyles[0];
  const contests = getContests({ ballotStyle, election });
  assert(contests.some((c) => c.id === 'judicial-robert-demergue'));
  for (const contest of contests) {
    if (contest.id === 'judicial-robert-demergue') continue;
    userEvent.type(
      screen.getByTestId(`${contest.id}-undervotes-input`).closest('input')!,
      contest.type === 'candidate'
        ? String(totalBallots * contest.seats)
        : String(totalBallots)
    );
    await waitFor(() => {
      expect(
        screen.getByTestId(`${contest.id}-numBallots`).textContent
      ).toEqual(String(totalBallots));
    });
  }

  fireEvent.click(
    screen.getByText('Save Precinct Results for Center Springfield')
  );
  await waitFor(() =>
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.ManualTallyDataEdited,
      'election_manager',
      expect.objectContaining({ disposition: 'success' })
    )
  );
  expect(updateExternalTally).toHaveBeenCalledTimes(1);
  expect(updateExternalTally).toHaveBeenCalledWith(
    expect.objectContaining({
      overallTally: {
        numberOfBallotsCounted: 100,
        contestTallies: expect.objectContaining({
          'judicial-robert-demergue': expect.objectContaining({
            metadata: { ballots: 100, undervotes: 4, overvotes: 6 },
            tallies: {
              yes: { option: ['yes'], tally: 50 },
              no: { option: ['no'], tally: 40 },
            },
          }),
        }),
      },
    })
  );
});

test('loads preexisting manual data to edit', async () => {
  const { election } = electionSampleDefinition;
  const talliesByPrecinct = getEmptyExternalTalliesByPrecinct(election);
  const ballotStyle1 = election.ballotStyles[0];
  const ballotStyle2 = election.ballotStyles[1];
  const tally1 = buildExternalTally(election, 1, [ballotStyle1]);
  const tally2 = buildExternalTally(election, 2, [ballotStyle2]);
  talliesByPrecinct['23'] = tally1;
  talliesByPrecinct['20'] = tally2;

  const resultsByCategory = new Map();
  resultsByCategory.set(TallyCategory.Precinct, talliesByPrecinct);
  const externalTally: FullElectionExternalTally = {
    overallTally: getEmptyExternalTally(),
    resultsByCategory,
    votingMethod: VotingMethod.Absentee,
    inputSourceName: `Doesn't matter`,
    source: ExternalTallySourceType.Manual,
    timestampCreated: new Date(),
  };

  const updateExternalTally = jest.fn();
  renderInAppContext(
    <Route path="/tally/manual-data-import/precinct/:precinctId">
      <ManualDataImportPrecinctScreen />
    </Route>,
    {
      route: '/tally/manual-data-import/precinct/23',
      updateExternalTally,
      manualTallyVotingMethod: VotingMethod.Precinct,
      electionDefinition: electionSampleDefinition,
      fullElectionExternalTallies: new Map([
        [externalTally.source, externalTally],
      ]),
    }
  );
  await screen.findByText('Manually Entered Absentee Results:');

  // Check contests with mock data
  const commissionersTally = tally1.contestTallies['county-commissioners'];
  assert(commissionersTally);
  expect(
    screen.getByTestId('county-commissioners-numBallots')
  ).toHaveTextContent(commissionersTally.metadata.ballots.toString());
  expect(
    screen
      .getByTestId('county-commissioners-undervotes-input')
      .closest('input')!.value
  ).toEqual(commissionersTally.metadata.undervotes.toString());
  expect(
    screen.getByTestId('county-commissioners-overvotes-input').closest('input')!
      .value
  ).toEqual(commissionersTally.metadata.overvotes.toString());
  expect(
    screen.getByTestId('county-commissioners-argent-input').closest('input')!
      .value
  ).toEqual(commissionersTally.tallies['argent']!.tally.toString());

  const tallyJudicial = tally1.contestTallies['judicial-robert-demergue'];
  assert(tallyJudicial);
  expect(
    screen.getByTestId('judicial-robert-demergue-numBallots')
  ).toHaveTextContent(tallyJudicial.metadata.ballots.toString());
  expect(
    screen
      .getByTestId('judicial-robert-demergue-undervotes-input')
      .closest('input')!.value
  ).toEqual(tallyJudicial.metadata.undervotes.toString());
  expect(
    screen
      .getByTestId('judicial-robert-demergue-overvotes-input')
      .closest('input')!.value
  ).toEqual(tallyJudicial.metadata.overvotes.toString());
  expect(
    screen.getByTestId('judicial-robert-demergue-yes-input').closest('input')!
      .value
  ).toEqual(tallyJudicial.tallies['yes']!.tally.toString());
  expect(
    screen.getByTestId('judicial-robert-demergue-no-input').closest('input')!
      .value
  ).toEqual(tallyJudicial.tallies['no']!.tally.toString());
});

test('shows an error message on save if the contest tallies are inconsistent', async () => {
  const updateExternalTally = jest.fn();
  const logger = fakeLogger();
  renderInAppContext(
    <Route path="/tally/manual-data-import/precinct/:precinctId">
      <ManualDataImportPrecinctScreen />
    </Route>,
    {
      route: '/tally/manual-data-import/precinct/23',
      updateExternalTally,
      electionDefinition: electionSampleDefinition,
      logger,
    }
  );
  await screen.findByText('Manually Entered Precinct Results:');
  screen.getByText('Center Springfield');

  userEvent.type(
    screen.getByTestId('president-undervotes-input').closest('input')!,
    '4'
  );
  userEvent.click(
    screen.getByText('Save Precinct Results for Center Springfield')
  );
  await screen.findByText('Inconsistent Results');
  userEvent.click(screen.getByText('Close'));
  expect(screen.queryByText('Inconsistent Results')).not.toBeInTheDocument();
  expect(updateExternalTally).not.toHaveBeenCalled();
});
