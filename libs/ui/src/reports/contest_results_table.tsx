import React from 'react';
import styled from 'styled-components';
import pluralize from 'pluralize';

import {
  Election,
  getContestDistrictName,
  Tabulation,
  AnyContest,
} from '@votingworks/types';
import {
  getContestVoteOptionsForCandidateContest,
  format,
} from '@votingworks/utils';
import { throwIllegalValue, assert, Optional } from '@votingworks/basics';

import { Text, NoWrap } from '../text';
import { tableBorderColor } from '../table';

const Contest = styled.div`
  margin: 1rem 0;
  page-break-inside: avoid;
  p:first-child {
    margin-bottom: 0;
  }
  h3 {
    margin-top: 0;
    margin-bottom: 0.5em;
    & + p {
      margin-top: -0.8em;
      margin-bottom: 0.25em;
    }
    & + table {
      margin-top: -0.5em;
    }
  }
`;

const ContestTable = styled.table`
  width: 100%;
  height: 1px; /* fake height, allows TallyContainer to stretch to full height */
  border-collapse: collapse;
  & tr {
    border-top: 1px solid ${tableBorderColor};
    border-bottom: 1px solid ${tableBorderColor};
    height: 100%;
  }
  & tr.metadata {
    font-size: 0.75em;
  }
  & tr.metadata.last-metadata {
    border-bottom: 1px solid #e6e6e6;
  }
  & td {
    width: 1%;
    height: 100%;
    padding: 0.1rem 0.25rem;
    padding-right: 0;
    text-align: right;
    white-space: no-wrap;
  }
  & th {
    padding: 0 0.2rem;
    text-align: right;
    font-weight: 400;
    &:first-child {
      padding-left: 0.1rem;
      text-align: left;
    }
    &:not(:first-child) {
      padding-right: 0;
    }
  }
`;

const Muted = styled.span`
  color: #808080;
`;

function ContestOptionRow({
  testId,
  optionLabel,
  scannedTally,
  showManualTally,
  manualTally,
}: {
  testId: string;
  optionLabel: string;
  scannedTally: number;
  showManualTally: boolean;
  manualTally: number;
}): JSX.Element {
  if (showManualTally) {
    return (
      <tr data-testid={testId}>
        <th>{optionLabel}</th>
        <td>{format.count(scannedTally)}</td>
        <td>
          {manualTally === 0 ? (
            <Muted>{format.count(manualTally)}</Muted>
          ) : (
            format.count(manualTally)
          )}
        </td>
        <td>
          <strong>{format.count(scannedTally + manualTally)}</strong>
        </td>
      </tr>
    );
  }

  return (
    <tr data-testid={testId}>
      <th colSpan={3}>{optionLabel}</th>
      <td>{format.count(scannedTally)}</td>
    </tr>
  );
}

function ContestMetadataRow({
  label,
  scannedTally,
  manualTally,
  isLast,
}: {
  label: string;
  scannedTally: number;
  manualTally: number;
  isLast?: boolean;
}): JSX.Element {
  return (
    <tr className={`metadata ${isLast ? '' : 'last-metadata'}`}>
      <th>
        <em>{label}</em>
      </th>
      <td>{format.count(scannedTally)}</td>
      <td>
        {manualTally === 0 ? (
          <Muted>{format.count(manualTally)}</Muted>
        ) : (
          format.count(manualTally)
        )}
      </td>
      <td>
        <strong>{format.count(scannedTally + manualTally)}</strong>
      </td>
    </tr>
  );
}

interface Props {
  election: Election;
  contest: AnyContest;
  scannedContestResults: Tabulation.ContestResults;
  manualContestResults?: Tabulation.ContestResults;
}

// eslint-disable-next-line vx/gts-no-return-type-only-generics
function assertIsOptional<T>(value?: unknown): asserts value is Optional<T> {
  // noop
}

export function ContestResultsTable({
  election,
  contest,
  scannedContestResults,
  manualContestResults,
}: Props): JSX.Element {
  // When there are manual results, the metadata is included as table rows
  // rather than as an above table caption.
  const contestTableRows: JSX.Element[] = manualContestResults
    ? [
        <tr className="metadata header" key={`${contest.id}-header`}>
          <th> </th>
          <th>scanned</th>
          <th data-testid="contest-manual-results">manual</th>
          <th>
            <strong>total</strong>
          </th>
        </tr>,
        <ContestMetadataRow
          label="Ballots Cast"
          key={`${contest.id}-ballots-cast`}
          scannedTally={scannedContestResults.ballots}
          manualTally={manualContestResults.ballots}
        />,
        <ContestMetadataRow
          label="Overvotes"
          key={`${contest.id}-overvotes`}
          scannedTally={scannedContestResults.overvotes}
          manualTally={manualContestResults.overvotes}
        />,
        <ContestMetadataRow
          label="Undervotes"
          key={`${contest.id}-undervotes`}
          scannedTally={scannedContestResults.undervotes}
          manualTally={manualContestResults.undervotes}
          isLast
        />,
      ]
    : [];

  const hasManualResults = Boolean(manualContestResults);

  switch (contest.type) {
    case 'candidate': {
      assert(scannedContestResults.contestType === 'candidate');
      assertIsOptional<Tabulation.CandidateContestResults>(
        manualContestResults
      );
      for (const candidate of getContestVoteOptionsForCandidateContest(
        contest
      )) {
        const key = `${contest.id}-${candidate.id}`;
        contestTableRows.push(
          <ContestOptionRow
            key={key}
            testId={key}
            optionLabel={candidate.name}
            scannedTally={
              scannedContestResults.tallies[candidate.id]?.tally ?? 0
            }
            manualTally={
              manualContestResults?.tallies[candidate.id]?.tally ?? 0
            }
            showManualTally={hasManualResults}
          />
        );
      }
      break;
    }
    case 'yesno': {
      assert(scannedContestResults.contestType === 'yesno');
      assertIsOptional<Tabulation.YesNoContestResults>(manualContestResults);
      const yesKey = `${contest.id}-yes`;
      contestTableRows.push(
        <ContestOptionRow
          key={yesKey}
          testId={yesKey}
          optionLabel="Yes"
          scannedTally={scannedContestResults.yesTally}
          manualTally={manualContestResults?.yesTally ?? 0}
          showManualTally={hasManualResults}
        />
      );
      const noKey = `${contest.id}-no`;
      contestTableRows.push(
        <ContestOptionRow
          key={noKey}
          testId={noKey}
          optionLabel="No"
          scannedTally={scannedContestResults.noTally}
          manualTally={manualContestResults?.noTally ?? 0}
          showManualTally={hasManualResults}
        />
      );
      break;
    }
    // istanbul ignore next
    default:
      throwIllegalValue(contest);
  }

  return (
    <Contest data-testid={`results-table-${contest.id}`}>
      <Text small>{getContestDistrictName(election, contest)}</Text>
      <h3>
        {contest.title}
        {contest.type === 'candidate' && contest.seats > 1 && (
          <React.Fragment>
            {' '}
            <Text as="span" noWrap small>
              ({contest.seats} seats)
            </Text>
          </React.Fragment>
        )}
      </h3>
      {!hasManualResults && (
        <Text small>
          <NoWrap>
            {`${format.count(scannedContestResults.ballots)} ${pluralize(
              'ballots',
              scannedContestResults.ballots
            )}`}{' '}
            cast /
          </NoWrap>{' '}
          <NoWrap>
            {' '}
            {`${format.count(scannedContestResults.overvotes)} ${pluralize(
              'overvotes',
              scannedContestResults.overvotes
            )}`}{' '}
            /
          </NoWrap>{' '}
          <NoWrap>
            {' '}
            {`${format.count(scannedContestResults.undervotes)} ${pluralize(
              'undervotes',
              scannedContestResults.undervotes
            )}`}
          </NoWrap>
        </Text>
      )}
      <ContestTable>
        <tbody>{contestTableRows}</tbody>
      </ContestTable>
    </Contest>
  );
}
