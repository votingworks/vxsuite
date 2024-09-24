import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import {
  electionTwoPartyPrimaryDefinition,
  electionFamousNames2021Fixtures,
} from '@votingworks/fixtures';
import { PartyId } from '@votingworks/types';
import { render, screen } from '../../test/react_testing_library';
import { PrecinctScannerReportHeader } from './precinct_scanner_report_header';

const pollsTransitionedTime = new Date('2022-10-31T16:23:00.000').getTime();
const reportPrintedTime = new Date('2022-10-31T16:24:00.000').getTime();

const { electionDefinition: generalElectionDefinition } =
  electionFamousNames2021Fixtures;

test('general election, all precincts, polls open, test mode', () => {
  render(
    <PrecinctScannerReportHeader
      electionDefinition={generalElectionDefinition}
      precinctSelection={ALL_PRECINCTS_SELECTION}
      pollsTransition="open_polls"
      isLiveMode={false}
      pollsTransitionedTime={pollsTransitionedTime}
      reportPrintedTime={reportPrintedTime}
      precinctScannerMachineId="SC-01-000"
    />
  );
  expect(screen.queryByText('Party')).toBeNull();
  screen.getByText('Test Polls Opened Report • All Precincts');
  screen.getByText(
    'Lincoln Municipal General Election, Jun 6, 2021, Franklin County, State of Hamilton'
  );
  const eventDate = screen.getByText('Polls Opened:');
  expect(eventDate.parentNode).toHaveTextContent(
    'Polls Opened: Oct 31, 2022, 4:23 PM'
  );
  const printedAt = screen.getByText('Report Printed:');
  expect(printedAt.parentElement).toHaveTextContent(
    'Report Printed: Oct 31, 2022, 4:24 PM'
  );
  const scannerId = screen.getByText('Scanner ID:');
  expect(scannerId.parentElement).toHaveTextContent('Scanner ID: SC-01-000');
});

test('primary election, single precinct, polls closed, live mode', () => {
  render(
    <PrecinctScannerReportHeader
      electionDefinition={electionTwoPartyPrimaryDefinition}
      precinctSelection={singlePrecinctSelectionFor('precinct-1')}
      partyId={'0' as PartyId}
      pollsTransition="close_polls"
      isLiveMode
      pollsTransitionedTime={pollsTransitionedTime}
      reportPrintedTime={reportPrintedTime}
      precinctScannerMachineId="SC-01-000"
    />
  );
  expect(screen.queryByText('Party')).toBeNull();
  screen.getByText('Polls Closed Report • Precinct 1');
  screen.getByText(
    'Mammal Party, Example Primary Election, Sep 8, 2021, Sample County, State of Sample'
  );
  const eventDate = screen.getByText('Polls Closed:');
  expect(eventDate.parentNode).toHaveTextContent(
    'Polls Closed: Oct 31, 2022, 4:23 PM'
  );
  const printedAt = screen.getByText('Report Printed:');
  expect(printedAt.parentElement).toHaveTextContent(
    'Report Printed: Oct 31, 2022, 4:24 PM'
  );
  const scannerId = screen.getByText('Scanner ID:');
  expect(scannerId.parentElement).toHaveTextContent('Scanner ID: SC-01-000');
});

test('primary election nonpartisan contests', () => {
  render(
    <PrecinctScannerReportHeader
      electionDefinition={electionTwoPartyPrimaryDefinition}
      precinctSelection={singlePrecinctSelectionFor('precinct-1')}
      pollsTransition="close_polls"
      isLiveMode
      pollsTransitionedTime={pollsTransitionedTime}
      reportPrintedTime={reportPrintedTime}
      precinctScannerMachineId="SC-01-000"
    />
  );
  screen.getByText(
    'Nonpartisan Contests, Example Primary Election, Sep 8, 2021, Sample County, State of Sample'
  );
});

test('primary election, polls paused', () => {
  render(
    <PrecinctScannerReportHeader
      electionDefinition={electionTwoPartyPrimaryDefinition}
      partyId={'0' as PartyId}
      precinctSelection={ALL_PRECINCTS_SELECTION}
      pollsTransition="pause_voting"
      pollsTransitionedTime={pollsTransitionedTime}
      isLiveMode={false}
      reportPrintedTime={reportPrintedTime}
      precinctScannerMachineId="SC-01-000"
    />
  );
  screen.getByText('Test Voting Paused Report • All Precincts');
  // No party label shown for paused voting
  screen.getByText(
    'Example Primary Election, Sep 8, 2021, Sample County, State of Sample'
  );
});
