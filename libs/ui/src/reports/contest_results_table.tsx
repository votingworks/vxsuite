import styled from 'styled-components';
import pluralize from 'pluralize';

import {
  Election,
  getContestDistrictName,
  Tabulation,
  Contest,
} from '@votingworks/types';
import { format, getTallyReportCandidateRows } from '@votingworks/utils';
import { throwIllegalValue, assert, Optional, find } from '@votingworks/basics';

import { ReportTable } from './layout';
import { Font } from '../typography';

const DistrictName = styled.p`
  margin-bottom: 0;
  font-size: 0.8em;
`;

const ContestTitle = styled.h3`
  margin-top: 0;
  margin-bottom: 0.2em;
`;

const ContestMetadata = styled.p`
  margin-top: -0.2em;
  margin-bottom: 0.2em;
  font-weight: 500;
  font-size: 0.8em;
`;

const MetadataLabel = styled.p`
  margin-top: 0;
  margin-bottom: 0.2em;
  font-size: 0.8em;
`;

const ContestContainer = styled.div`
  margin: 2.5em 0;
  page-break-inside: avoid;
`;

const ContestTable = styled(ReportTable)`
  width: 100%;
  height: 1px; /* mock height, allows TallyContainer to stretch to full height */

  & tr {
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
    padding: 0.25em 0.625em;
    padding-right: 0;
    text-align: right;
    white-space: no-wrap;
  }

  & th {
    padding: 0 0.5em;
    text-align: right;
    font-weight: 400;

    &.option-label {
      padding: 0.25em 0.5em;
      line-height: 1;
    }

    &:first-child {
      padding-left: 0.25em;
      text-align: left;
      word-break: break-word;
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
  separateScannedAndManualTally,
  manualTally,
}: {
  testId: string;
  optionLabel: string;
  scannedTally: number;
  separateScannedAndManualTally: boolean;
  manualTally: number;
}): JSX.Element {
  if (separateScannedAndManualTally) {
    return (
      <tr data-testid={testId}>
        <th className="option-label">{optionLabel.replace('-', '‑')}</th>
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
      <td>{format.count(scannedTally + manualTally)}</td>
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
  contest: Contest;
  scannedContestResults: Tabulation.ContestResults;
  manualContestResults?: Tabulation.ContestResults;
  aggregateInsignificantWriteIns?: boolean;
  /**
   * When false, the manual tallies are summed into the single column of
   * totals instead of getting a column of their own beside the scanned
   * tallies.
   */
  separateScannedAndManualTallies?: boolean;
}

// eslint-disable-next-line vx/gts-no-return-type-only-generics
function assertIsOptional<T>(_value?: unknown): asserts _value is Optional<T> {
  // noop
}

export function ContestResultsTable({
  election,
  contest,
  scannedContestResults,
  manualContestResults,
  aggregateInsignificantWriteIns = true,
  separateScannedAndManualTallies = true,
}: Props): JSX.Element {
  // Manual tallies that aren't broken out are still counted; they're summed
  // into the single column of totals.
  const manualColumnResults = separateScannedAndManualTallies
    ? manualContestResults
    : undefined;

  // When the manual tallies are broken out, the metadata is included as table
  // rows rather than as an above table caption.
  const contestTableRows: JSX.Element[] = manualColumnResults
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
          manualTally={manualColumnResults.ballots}
        />,
        <ContestMetadataRow
          label="Overvotes"
          key={`${contest.id}-overvotes`}
          scannedTally={scannedContestResults.overvotes}
          manualTally={manualColumnResults.overvotes}
        />,
        <ContestMetadataRow
          label="Undervotes"
          key={`${contest.id}-undervotes`}
          scannedTally={scannedContestResults.undervotes}
          manualTally={manualColumnResults.undervotes}
          isLast
        />,
      ]
    : [];

  const hasManualColumn = Boolean(manualColumnResults);

  // The caption describes the single column of totals, so it includes the
  // manual tallies when they aren't broken out.
  const totalBallots =
    scannedContestResults.ballots + (manualContestResults?.ballots ?? 0);
  const totalOvervotes =
    scannedContestResults.overvotes + (manualContestResults?.overvotes ?? 0);
  const totalUndervotes =
    scannedContestResults.undervotes + (manualContestResults?.undervotes ?? 0);

  switch (contest.type) {
    case 'candidate': {
      assert(scannedContestResults.contestType === 'candidate');
      assertIsOptional<Tabulation.CandidateContestResults>(
        manualContestResults
      );
      const candidateReportTallies = getTallyReportCandidateRows({
        contest,
        scannedContestResults,
        manualContestResults,
        aggregateInsignificantWriteIns,
      });
      for (const candidateReportTally of candidateReportTallies) {
        const key = `${contest.id}-${candidateReportTally.id}`;
        contestTableRows.push(
          <ContestOptionRow
            key={key}
            testId={key}
            optionLabel={candidateReportTally.name}
            scannedTally={candidateReportTally.scannedTally}
            manualTally={candidateReportTally.manualTally}
            separateScannedAndManualTally={hasManualColumn}
          />
        );
      }
      break;
    }
    case 'yesno': {
      assert(scannedContestResults.contestType === 'yesno');
      assertIsOptional<Tabulation.YesNoContestResults>(manualContestResults);
      for (const option of contest.options) {
        const key = `${contest.id}-${option.id}`;
        contestTableRows.push(
          <ContestOptionRow
            key={key}
            testId={key}
            optionLabel={option.label}
            scannedTally={scannedContestResults.tallies[option.id] ?? 0}
            manualTally={manualContestResults?.tallies[option.id] ?? 0}
            separateScannedAndManualTally={hasManualColumn}
          />
        );
      }
      break;
    }
    case 'straight-party': {
      assert(scannedContestResults.contestType === 'straight-party');
      assertIsOptional<Tabulation.StraightPartyContestResults>(
        manualContestResults
      );
      for (const partyId of contest.optionIds) {
        const key = `${contest.id}-${partyId}`;
        contestTableRows.push(
          <ContestOptionRow
            key={key}
            testId={key}
            optionLabel={
              find(election.parties, (party) => party.id === partyId).fullName
            }
            scannedTally={scannedContestResults.tallies[partyId]}
            manualTally={manualContestResults?.tallies[partyId] ?? 0}
            separateScannedAndManualTally={hasManualColumn}
          />
        );
      }
      break;
    }
    default: {
      /* istanbul ignore next */
      throwIllegalValue(contest);
    }
  }

  return (
    <ContestContainer data-testid={`results-table-${contest.id}`}>
      <DistrictName>{getContestDistrictName(election, contest)}</DistrictName>
      <ContestTitle>{contest.title}</ContestTitle>
      {contest.type === 'candidate' && (
        <ContestMetadata>
          Vote for {contest.seats}
          {contest.type === 'candidate' && contest.termDescription && (
            <span> • {contest.termDescription}</span>
          )}
        </ContestMetadata>
      )}
      {!hasManualColumn && (
        <MetadataLabel>
          <Font noWrap>
            {`${format.count(totalBallots)} ${pluralize(
              'ballots',
              totalBallots
            )}`}{' '}
            cast /
          </Font>{' '}
          <Font noWrap>
            {' '}
            {`${format.count(totalOvervotes)} ${pluralize(
              'overvotes',
              totalOvervotes
            )}`}{' '}
            /
          </Font>{' '}
          <Font noWrap>
            {' '}
            {`${format.count(totalUndervotes)} ${pluralize(
              'undervotes',
              totalUndervotes
            )}`}
          </Font>
        </MetadataLabel>
      )}
      <ContestTable>
        <tbody>{contestTableRows}</tbody>
      </ContestTable>
    </ContestContainer>
  );
}
