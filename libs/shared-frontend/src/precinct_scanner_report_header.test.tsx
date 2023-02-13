import React from 'react';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/shared';
import { render, screen } from '@testing-library/react';
import {
  electionMinimalExhaustiveSampleDefinition,
  electionFamousNames2021Fixtures,
} from '@votingworks/fixtures';
import { PartyId } from '@votingworks/types';
import { PrecinctScannerReportHeader } from './precinct_scanner_report_header';

const pollsTransitionedTime = new Date('2022-10-31T16:23:00.000Z').getTime();
const currentTime = new Date('2022-10-31T16:24:00.000Z').getTime();

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
      currentTime={currentTime}
      precinctScannerMachineId="SC-01-000"
    />
  );
  expect(screen.queryByText('Party')).toBeNull();
  screen.getByText('TEST Polls Opened Report for All Precincts');
  const electionTitle = screen.getByText('Lincoln Municipal General Election:');
  expect(electionTitle.parentElement).toHaveTextContent(
    'Lincoln Municipal General Election: Sunday, June 6, 2021, Franklin County, State of Hamilton'
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
      electionDefinition={electionMinimalExhaustiveSampleDefinition}
      precinctSelection={singlePrecinctSelectionFor('precinct-1')}
      partyId={'0' as PartyId}
      pollsTransition="close_polls"
      isLiveMode
      pollsTransitionedTime={pollsTransitionedTime}
      currentTime={currentTime}
      precinctScannerMachineId="SC-01-000"
    />
  );
  expect(screen.queryByText('Party')).toBeNull();
  screen.getByText('Official Polls Closed Report for Precinct 1');
  const electionTitle = screen.getByText(
    'Mammal Party Example Primary Election:'
  );
  expect(electionTitle.parentElement).toHaveTextContent(
    'Mammal Party Example Primary Election: Wednesday, September 8, 2021, Sample County, State of Sample'
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
