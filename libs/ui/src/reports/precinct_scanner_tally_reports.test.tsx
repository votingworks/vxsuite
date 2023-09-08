import {
  electionFamousNames2021Fixtures,
  electionTwoPartyPrimaryDefinition,
  electionMinimalExhaustiveSampleWithReportingUrlDefinition,
} from '@votingworks/fixtures';
import {
  ALL_PRECINCTS_SELECTION,
  buildElectionResultsFixture,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { render, screen, within } from '../../test/react_testing_library';
import { PrecinctScannerTallyReports } from './precinct_scanner_tally_reports';

test('polls open, primary, single precinct, live mode', () => {
  const { election } = electionTwoPartyPrimaryDefinition;
  const precinctSelection = singlePrecinctSelectionFor('precinct-1');

  const mammalResults = buildElectionResultsFixture({
    election,
    cardCounts: {
      bmd: 200,
      hmpb: [],
    },
    contestResultsSummaries: {
      'best-animal-mammal': {
        type: 'candidate',
        undervotes: 10,
        overvotes: 10,
        ballots: 200,
        officialOptionTallies: {
          horse: 180,
        },
      },
      fishing: {
        type: 'yesno',
        undervotes: 10,
        overvotes: 10,
        ballots: 200,
        yesTally: 100,
        noTally: 80,
      },
    },
    includeGenericWriteIn: true,
  });
  const fishResults = buildElectionResultsFixture({
    election,
    cardCounts: {
      bmd: 100,
      hmpb: [],
    },
    contestResultsSummaries: {
      'best-animal-fish': {
        type: 'candidate',
        undervotes: 10,
        overvotes: 10,
        ballots: 100,
        officialOptionTallies: {
          seahorse: 80,
        },
      },
      fishing: {
        type: 'yesno',
        undervotes: 10,
        overvotes: 10,
        ballots: 100,
        noTally: 60,
        yesTally: 20,
      },
    },
    includeGenericWriteIn: true,
  });
  render(
    <PrecinctScannerTallyReports
      electionDefinition={electionTwoPartyPrimaryDefinition}
      precinctSelection={precinctSelection}
      electionResultsByParty={[
        {
          ...mammalResults,
          partyId: '0',
        },
        {
          ...fishResults,
          partyId: '1',
        },
      ]}
      pollsTransition="open_polls"
      isLiveMode
      pollsTransitionedTime={new Date().getTime()}
      precinctScannerMachineId="SC-01-000"
      totalBallotsScanned={1} // to trigger qr code page
      signedQuickResultsReportingUrl="https://voting.works"
    />
  );

  expect(
    screen.getAllByText('Official Polls Opened Report for Precinct 1')
  ).toHaveLength(3);

  // checking mammal report
  const mammalReport = screen.getByTestId('tally-report-0-precinct-1');
  within(mammalReport).getByText('Mammal Party Example Primary Election:');
  within(within(mammalReport).getByTestId('bmd')).getByText('200');
  within(mammalReport).getByTestId('results-table-best-animal-mammal');
  within(mammalReport).getByTestId('results-table-zoo-council-mammal');
  expect(within(mammalReport).getAllByTestId(/results-table-/)).toHaveLength(2);
  within(
    within(mammalReport).getByTestId('best-animal-mammal-horse')
  ).getByText('180');

  // checking mammal report
  const fishReport = screen.getByTestId('tally-report-1-precinct-1');
  within(fishReport).getByText('Fish Party Example Primary Election:');
  within(within(fishReport).getByTestId('bmd')).getByText('100');
  within(fishReport).getByTestId('results-table-best-animal-fish');
  within(fishReport).getByTestId('results-table-aquarium-council-fish');
  expect(within(fishReport).getAllByTestId(/results-table-/)).toHaveLength(2);
  within(within(fishReport).getByTestId('best-animal-fish-seahorse')).getByText(
    '80'
  );

  // checking nonpartisan report, which should combine nonpartisan results of both
  const nonpartisanReport = screen.getByTestId(
    'tally-report-undefined-precinct-1'
  );
  within(nonpartisanReport).getByText(
    'Example Primary Election Nonpartisan Contests:'
  );
  within(within(nonpartisanReport).getByTestId('bmd')).getByText('300');
  within(nonpartisanReport).getByTestId('results-table-fishing');
  within(nonpartisanReport).getByTestId('results-table-new-zoo-either');
  within(nonpartisanReport).getByTestId('results-table-new-zoo-pick');
  expect(
    within(nonpartisanReport).getAllByTestId(/results-table-/)
  ).toHaveLength(3);
  within(within(nonpartisanReport).getByTestId('fishing-yes')).getByText('120');

  // no results reporting page
  expect(
    screen.queryByText('Automatic Election Results Reporting')
  ).not.toBeInTheDocument();
});

test('polls closed, general, All Precincts, test mode', () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { election } = electionDefinition;

  const results = buildElectionResultsFixture({
    election,
    cardCounts: {
      bmd: 100,
      hmpb: [],
    },
    contestResultsSummaries: {
      'board-of-alderman': {
        type: 'candidate',
        undervotes: 0,
        overvotes: 0,
        ballots: 100,
        officialOptionTallies: {
          'helen-keller': 400,
        },
      },
    },
    includeGenericWriteIn: true,
  });

  render(
    <PrecinctScannerTallyReports
      electionDefinition={electionDefinition}
      precinctSelection={ALL_PRECINCTS_SELECTION}
      electionResultsByParty={[results]}
      pollsTransition="close_polls"
      isLiveMode={false}
      pollsTransitionedTime={new Date().getTime()}
      precinctScannerMachineId="SC-01-000"
      totalBallotsScanned={0}
      signedQuickResultsReportingUrl="https://voting.works"
    />
  );

  expect(screen.getAllByTestId(/tally-report-/)).toHaveLength(1);
  screen.getByText('TEST Polls Closed Report for All Precincts');
  within(screen.getByTestId('bmd')).getByText('100');
  expect(
    screen.queryByText('Automatic Election Results Reporting')
  ).not.toBeInTheDocument();
});

test('includes quick results page under right conditions', () => {
  render(
    <PrecinctScannerTallyReports
      electionDefinition={
        electionMinimalExhaustiveSampleWithReportingUrlDefinition
      }
      precinctSelection={ALL_PRECINCTS_SELECTION}
      electionResultsByParty={[]}
      pollsTransition="close_polls" // to trigger qrcode
      isLiveMode
      pollsTransitionedTime={new Date().getTime()}
      precinctScannerMachineId="SC-01-000"
      totalBallotsScanned={1} // to trigger qrcode
      signedQuickResultsReportingUrl="https://voting.works"
    />
  );

  screen.getByText('Automatic Election Results Reporting');
});

test('does not include quick results page if ballot count is 0', () => {
  render(
    <PrecinctScannerTallyReports
      electionDefinition={
        electionMinimalExhaustiveSampleWithReportingUrlDefinition
      }
      precinctSelection={ALL_PRECINCTS_SELECTION}
      electionResultsByParty={[]}
      pollsTransition="close_polls" // to trigger qrcode
      isLiveMode
      pollsTransitionedTime={new Date().getTime()}
      precinctScannerMachineId="SC-01-000"
      totalBallotsScanned={0} // to disable qrcode
      signedQuickResultsReportingUrl="https://voting.works"
    />
  );

  expect(
    screen.queryByText('Automatic Election Results Reporting')
  ).not.toBeInTheDocument();
});

test('does not include quick results page if polls are being opened', () => {
  render(
    <PrecinctScannerTallyReports
      electionDefinition={
        electionMinimalExhaustiveSampleWithReportingUrlDefinition
      }
      precinctSelection={ALL_PRECINCTS_SELECTION}
      electionResultsByParty={[]}
      pollsTransition="open_polls" // to disable qrcode
      isLiveMode
      pollsTransitionedTime={new Date().getTime()}
      precinctScannerMachineId="SC-01-000"
      totalBallotsScanned={1} // to trigger qrcode
      signedQuickResultsReportingUrl="https://voting.works"
    />
  );

  expect(
    screen.queryByText('Automatic Election Results Reporting')
  ).not.toBeInTheDocument();
});
