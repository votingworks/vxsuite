import React, { useContext } from 'react';
import pluralize from 'pluralize';
import _ from 'lodash';

import { Dictionary } from '@votingworks/types';
import { assert, format, find } from '@votingworks/utils';
import { Table, TD, LogoMark } from '@votingworks/ui';
import { LogEventId } from '@votingworks/logging';
import { PrintableBallotType } from '../config/types';
import { routerPaths } from '../router_paths';

import { AppContext } from '../contexts/app_context';

import { PrintButton } from '../components/print_button';
import { Prose } from '../components/prose';
import { Text } from '../components/text';

import { NavigationScreen } from '../components/navigation_screen';

import { LinkButton } from '../components/link_button';

type PrintCounts = Dictionary<Dictionary<number>>;
type PrintCountsByType = Dictionary<Dictionary<Dictionary<number>>>;

export function PrintedBallotsReportScreen(): JSX.Element {
  const {
    electionDefinition,
    printedBallots,
    configuredAt,
    logger,
    currentUserSession,
  } = useContext(AppContext);
  assert(electionDefinition && typeof configuredAt === 'string');
  const { election } = electionDefinition;

  const totalBallotsPrinted = printedBallots.reduce(
    (count, ballot) => count + ballot.numCopies,
    0
  );

  const totalAbsenteeBallotsPrinted = printedBallots
    .filter((ballot) => ballot.type === PrintableBallotType.Absentee)
    .reduce((count, ballot) => count + ballot.numCopies, 0);

  const totalPrecinctBallotsPrinted = printedBallots
    .filter((ballot) => ballot.type === PrintableBallotType.Precinct)
    .reduce((count, ballot) => count + ballot.numCopies, 0);

  const zeroCounts = election.precincts.reduce<PrintCounts>(
    (counts, { id: precinctId }) => {
      const newCounts: PrintCounts = { ...counts };
      newCounts[precinctId] = election.ballotStyles
        .filter((bs) => bs.precincts.includes(precinctId))
        .reduce<Dictionary<number>>((bsCounts, { id: ballotStyleId }) => {
          const newBsCounts: Dictionary<number> = { ...bsCounts };
          newBsCounts[ballotStyleId] = 0;
          return newBsCounts;
        }, {});
      return newCounts;
    },
    {}
  );

  const zeroCountsByType: PrintCountsByType = Object.values(
    PrintableBallotType
  ).reduce(
    (counts, ballotType) => ({
      ...counts,
      [ballotType]: _.cloneDeep(zeroCounts),
    }),
    {}
  );

  const counts: PrintCounts = printedBallots.reduce(
    (accumulatedCounts, { precinctId, ballotStyleId, numCopies }) => ({
      ...accumulatedCounts,
      [precinctId]: {
        ...(accumulatedCounts[precinctId] ?? {}),
        [ballotStyleId]:
          (accumulatedCounts[precinctId]?.[ballotStyleId] ?? 0) + numCopies,
      },
    }),
    zeroCounts
  );

  const countsByType: PrintCountsByType = printedBallots.reduce(
    (accumulatedCounts, { precinctId, ballotStyleId, numCopies, type }) => ({
      ...accumulatedCounts,
      [type]: {
        ...(accumulatedCounts[type] ?? {}),
        [precinctId]: {
          ...(accumulatedCounts[type]?.[precinctId] ?? {}),
          [ballotStyleId]:
            (accumulatedCounts[type]?.[precinctId]?.[ballotStyleId] ?? 0) +
            numCopies,
        },
      },
    }),
    zeroCountsByType
  );

  const electionDate = format.localeWeekdayAndDate(new Date(election.date));
  const generatedAt = format.localeLongDateAndTime(new Date());

  function logAfterPrint() {
    assert(currentUserSession); // TODO auth check permissions for printing printed ballot report
    void logger.log(
      LogEventId.PrintedBallotReportPrinted,
      currentUserSession.type,
      {
        message: 'Printed ballot report successfully printed.',
        disposition: 'success',
      }
    );
  }

  function logAfterPrintError(errorMessage: string) {
    assert(currentUserSession); // TODO auth check permissions for printing printed ballot report
    void logger.log(
      LogEventId.PrintedBallotReportPrinted,
      currentUserSession.type,
      {
        message: `Error printing Printed ballot Report: ${errorMessage}`,
        disposition: 'failure',
        result:
          'Printed Ballot Report not printed, error message shown to user.',
      }
    );
  }

  const reportContent = (
    <Prose maxWidth={false}>
      <h1>Printed Ballots Report</h1>
      <p>
        {electionDate}, {election.county.name}, {election.state}
        <br />
        <Text small as="span">
          This report was created on {generatedAt}.
        </Text>
        <br />
        <Text small as="span">
          Configured with the current election at{' '}
          {format.localeLongDateAndTime(new Date(configuredAt))}.
        </Text>
      </p>
      <p>
        {pluralize('absentee ballot', totalAbsenteeBallotsPrinted, true)} and{' '}
        {pluralize('precinct ballot', totalPrecinctBallotsPrinted, true)}{' '}
        {pluralize('have', totalBallotsPrinted)} been printed.
      </p>
      <p>
        <strong>
          {pluralize('official ballot', totalBallotsPrinted, true)}{' '}
        </strong>{' '}
        {pluralize('have', totalBallotsPrinted)} been printed.
      </p>

      <p className="no-print">
        <PrintButton
          primary
          sides="one-sided"
          afterPrint={logAfterPrint}
          afterPrintError={logAfterPrintError}
        >
          Print Report
        </PrintButton>
      </p>
      <p className="no-print">
        <LinkButton small to={routerPaths.ballotsList}>
          Back to List Ballots
        </LinkButton>
      </p>

      <Table>
        <tbody>
          <tr>
            <TD as="th" narrow nowrap>
              Precinct
            </TD>
            <TD as="th" narrow nowrap>
              Ballot Style
            </TD>
            <TD as="th" narrow nowrap>
              Official Absentee Ballots Printed
            </TD>
            <TD as="th" narrow nowrap>
              Official Precinct Ballots Printed
            </TD>
            <TD as="th">Total Official Ballots Printed</TD>
          </tr>
          {Object.keys(counts).flatMap((precinctId) => {
            const precinct = find(
              election.precincts,
              (p) => p.id === precinctId
            );
            if (!precinct) {
              return null;
            }
            return Object.keys(counts[precinctId] ?? {}).map(
              (ballotStyleId) => (
                <tr
                  key={`${precinctId}-${ballotStyleId}`}
                  data-testid={`row-${precinctId}-${ballotStyleId}`}
                >
                  <TD nowrap>{precinct.name}</TD>
                  <TD>{ballotStyleId}</TD>
                  <TD>
                    {
                      countsByType[PrintableBallotType.Absentee]?.[
                        precinctId
                      ]?.[ballotStyleId]
                    }
                  </TD>
                  <TD>
                    {
                      countsByType[PrintableBallotType.Precinct]?.[
                        precinctId
                      ]?.[ballotStyleId]
                    }
                  </TD>
                  <TD>{counts[precinctId]?.[ballotStyleId]}</TD>
                </tr>
              )
            );
          })}
        </tbody>
      </Table>
    </Prose>
  );
  return (
    <React.Fragment>
      <NavigationScreen>{reportContent}</NavigationScreen>
      <div className="print-only">
        <LogoMark />
        {reportContent}
      </div>
    </React.Fragment>
  );
}
