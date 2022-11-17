import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  electionFamousNames2021Fixtures,
  electionMinimalExhaustiveSampleDefinition,
  electionMinimalExhaustiveSampleWithReportingUrlDefinition,
} from '@votingworks/fixtures';
import { FullElectionTally } from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  getEmptyTally,
  getSubTalliesByPartyAndPrecinct,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { PrecinctScannerFullReport } from './precinct_scanner_full_report';

test('polls closed: tally reports for each party in primary, single precinct', () => {
  const { election } = electionMinimalExhaustiveSampleDefinition;
  const precinctSelection = singlePrecinctSelectionFor('precinct-1');
  const tally: FullElectionTally = {
    overallTally: getEmptyTally(),
    resultsByCategory: new Map(),
  };
  const subTallies = getSubTalliesByPartyAndPrecinct({
    election,
    tally,
    precinctSelection,
  });
  render(
    <PrecinctScannerFullReport
      electionDefinition={electionMinimalExhaustiveSampleDefinition}
      precinctSelection={precinctSelection}
      subTallies={subTallies}
      pollsTransition="close_polls"
      isLiveMode
      pollsTransitionedTime={new Date().getTime()}
      currentTime={new Date().getTime()}
      precinctScannerMachineId="SC-01-000"
      totalBallotsScanned={1} // to trigger qr code page
      signedQuickResultsReportingUrl="https://voting.works"
    />
  );

  expect(
    screen.getAllByText('Official Polls Closed Report for Precinct 1')
  ).toHaveLength(2);
  screen.getByText('Mammal Party Example Primary Election:');
  screen.getByText('Fish Party Example Primary Election:');
  expect(
    screen.queryByText('Automatic Election Results Reporting')
  ).not.toBeInTheDocument();
});

test('polls closed: tally reports for each precinct when there is data for all precincts', () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { election } = electionDefinition;
  const tally: FullElectionTally = {
    overallTally: getEmptyTally(),
    resultsByCategory: new Map(),
  };
  const subTallies = getSubTalliesByPartyAndPrecinct({
    election,
    tally,
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
  render(
    <PrecinctScannerFullReport
      electionDefinition={electionDefinition}
      precinctSelection={ALL_PRECINCTS_SELECTION}
      hasPrecinctSubTallies
      subTallies={subTallies}
      pollsTransition="close_polls"
      isLiveMode
      pollsTransitionedTime={new Date().getTime()}
      currentTime={new Date().getTime()}
      precinctScannerMachineId="SC-01-000"
      totalBallotsScanned={0}
      signedQuickResultsReportingUrl="https://voting.works"
    />
  );

  screen.getByText('Official Polls Closed Report for North Lincoln');
  screen.getByText('Official Polls Closed Report for West Lincoln');
  screen.getByText('Official Polls Closed Report for East Lincoln');
  screen.getByText('Official Polls Closed Report for South Lincoln');
  expect(
    screen.queryByText('Automatic Election Results Reporting')
  ).not.toBeInTheDocument();
});

test('polls closed: tally report for "All Precincts" when there is only data for all precincts', () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { election } = electionDefinition;
  const tally: FullElectionTally = {
    overallTally: getEmptyTally(),
    resultsByCategory: new Map(),
  };
  const subTallies = getSubTalliesByPartyAndPrecinct({
    election,
    tally,
  });
  render(
    <PrecinctScannerFullReport
      electionDefinition={electionDefinition}
      precinctSelection={ALL_PRECINCTS_SELECTION}
      hasPrecinctSubTallies={false}
      subTallies={subTallies}
      pollsTransition="close_polls"
      isLiveMode
      pollsTransitionedTime={new Date().getTime()}
      currentTime={new Date().getTime()}
      precinctScannerMachineId="SC-01-000"
      totalBallotsScanned={0}
      signedQuickResultsReportingUrl="https://voting.works"
    />
  );

  screen.getByText('Official Polls Closed Report for All Precincts');
  expect(
    screen.queryByText('Automatic Election Results Reporting')
  ).not.toBeInTheDocument();
});

test('polls paused: includes ballot count page only', () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { election } = electionDefinition;
  const tally: FullElectionTally = {
    overallTally: getEmptyTally(),
    resultsByCategory: new Map(),
  };
  const subTallies = getSubTalliesByPartyAndPrecinct({
    election,
    tally,
  });
  render(
    <PrecinctScannerFullReport
      electionDefinition={electionDefinition}
      precinctSelection={ALL_PRECINCTS_SELECTION}
      hasPrecinctSubTallies={false}
      subTallies={subTallies}
      pollsTransition="pause_voting"
      isLiveMode
      pollsTransitionedTime={new Date().getTime()}
      currentTime={new Date().getTime()}
      precinctScannerMachineId="SC-01-000"
      totalBallotsScanned={0}
      signedQuickResultsReportingUrl="https://voting.works"
    />
  );

  screen.getByText('Official Voting Paused Report for All Precincts');
  screen.getByText('Ballots Scanned Count');
  expect(
    screen.queryByText('Automatic Election Results Reporting')
  ).not.toBeInTheDocument();
});

test('includes quick results page under right conditions', () => {
  const { election } =
    electionMinimalExhaustiveSampleWithReportingUrlDefinition;
  const tally: FullElectionTally = {
    overallTally: getEmptyTally(),
    resultsByCategory: new Map(),
  };
  const subTallies = getSubTalliesByPartyAndPrecinct({
    election,
    tally,
  });
  render(
    <PrecinctScannerFullReport
      electionDefinition={
        electionMinimalExhaustiveSampleWithReportingUrlDefinition
      }
      precinctSelection={ALL_PRECINCTS_SELECTION}
      subTallies={subTallies}
      pollsTransition="close_polls" // to trigger qrcode
      isLiveMode
      pollsTransitionedTime={new Date().getTime()}
      currentTime={new Date().getTime()}
      precinctScannerMachineId="SC-01-000"
      totalBallotsScanned={1} // to trigger qrcode
      signedQuickResultsReportingUrl="https://voting.works"
    />
  );

  screen.getByText('Automatic Election Results Reporting');
});

test('does not include quick results page if ballot count is 0', () => {
  const { election } =
    electionMinimalExhaustiveSampleWithReportingUrlDefinition;
  const tally: FullElectionTally = {
    overallTally: getEmptyTally(),
    resultsByCategory: new Map(),
  };
  const subTallies = getSubTalliesByPartyAndPrecinct({ election, tally });
  render(
    <PrecinctScannerFullReport
      electionDefinition={
        electionMinimalExhaustiveSampleWithReportingUrlDefinition
      }
      precinctSelection={ALL_PRECINCTS_SELECTION}
      subTallies={subTallies}
      pollsTransition="close_polls" // to trigger qrcode
      isLiveMode
      pollsTransitionedTime={new Date().getTime()}
      currentTime={new Date().getTime()}
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
  const { election } =
    electionMinimalExhaustiveSampleWithReportingUrlDefinition;
  const tally: FullElectionTally = {
    overallTally: getEmptyTally(),
    resultsByCategory: new Map(),
  };
  const subTallies = getSubTalliesByPartyAndPrecinct({
    election,
    tally,
  });
  render(
    <PrecinctScannerFullReport
      electionDefinition={
        electionMinimalExhaustiveSampleWithReportingUrlDefinition
      }
      precinctSelection={ALL_PRECINCTS_SELECTION}
      subTallies={subTallies}
      pollsTransition="open_polls" // to disable qrcode
      isLiveMode
      pollsTransitionedTime={new Date().getTime()}
      currentTime={new Date().getTime()}
      precinctScannerMachineId="SC-01-000"
      totalBallotsScanned={1} // to trigger qrcode
      signedQuickResultsReportingUrl="https://voting.works"
    />
  );

  expect(
    screen.queryByText('Automatic Election Results Reporting')
  ).not.toBeInTheDocument();
});
