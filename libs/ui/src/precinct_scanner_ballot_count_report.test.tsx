import React from 'react';
import { render, screen } from '@testing-library/react';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';

import { PrecinctScannerBallotCountReport } from './precinct_scanner_ballot_count_report';

const pollsTransitionedTime = new Date(2021, 8, 19, 11, 5).getTime();
const currentTime = new Date(2021, 8, 19, 11, 6).getTime();

test('renders info properly', () => {
  render(
    <PrecinctScannerBallotCountReport
      electionDefinition={electionSampleDefinition}
      precinctSelection={ALL_PRECINCTS_SELECTION}
      totalBallotsScanned={23}
      pollsTransition="pause_polls"
      pollsTransitionedTime={pollsTransitionedTime}
      currentTime={currentTime}
      isLiveMode={false}
      precinctScannerMachineId="SC-01-000"
    />
  );

  // Check header
  screen.getByText('TEST Polls Paused Report for All Precincts');
  const electionTitle = screen.getByText('General Election:');
  expect(electionTitle.parentElement).toHaveTextContent(
    'General Election: Tuesday, November 3, 2020, Franklin County, State of Hamilton'
  );
  const eventDate = screen.getByText('Polls Paused:');
  expect(eventDate.parentNode).toHaveTextContent(
    'Polls Paused: Sep 19, 2021, 11:05 AM'
  );
  const printedAt = screen.getByText('Report Printed:');
  expect(printedAt.parentElement).toHaveTextContent(
    'Report Printed: Sep 19, 2021, 11:06 AM'
  );
  const scannerId = screen.getByText('Scanner ID:');
  expect(scannerId.parentElement).toHaveTextContent('Scanner ID: SC-01-000');

  // Check contents
  const ballotsScannedCount = screen.getByText('Ballots Scanned Count');
  expect(ballotsScannedCount.parentElement).toHaveTextContent(
    'Ballots Scanned Count23'
  );

  const pollsStatus = screen.getByText('Polls Status');
  expect(pollsStatus.parentElement).toHaveTextContent('Polls StatusPaused');

  const timePollsPaused = screen.getByText('Time Polls Paused');
  expect(timePollsPaused.parentElement).toHaveTextContent(
    'Time Polls PausedSun, Sep 19, 2021, 11:05 AM'
  );
});
