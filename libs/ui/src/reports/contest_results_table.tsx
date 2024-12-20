import styled from 'styled-components';
import pluralize from 'pluralize';

import {
  Election,
  getContestDistrictName,
  Tabulation,
  AnyContest,
} from '@votingworks/types';
import { format, getTallyReportCandidateRows } from '@votingworks/utils';
import { throwIllegalValue, assert, Optional } from '@votingworks/basics';

import { reportColors } from './layout';
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

const Contest = styled.div`
  margin: 2.5em 0;
  page-break-inside: avoid;
`;

const ContestTable = styled.table`
  width: 100%;
  height: 1px; /* mock height, allows TallyContainer to stretch to full height */
  border-collapse: collapse;

  & tr {
    border-top: 1px solid ${reportColors.outline};
    border-bottom: 1px solid ${reportColors.outline};
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
      const candidateReportTallies = getTallyReportCandidateRows({
        contest,
        scannedContestResults,
        manualContestResults,
        aggregateInsignificantWriteIns: true,
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
          optionLabel={contest.yesOption.label}
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
          optionLabel={contest.noOption.label}
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
      {!hasManualResults && (
        <MetadataLabel>
          <Font noWrap>
            {`${format.count(scannedContestResults.ballots)} ${pluralize(
              'ballots',
              scannedContestResults.ballots
            )}`}{' '}
            cast /
          </Font>{' '}
          <Font noWrap>
            {' '}
            {`${format.count(scannedContestResults.overvotes)} ${pluralize(
              'overvotes',
              scannedContestResults.overvotes
            )}`}{' '}
            /
          </Font>{' '}
          <Font noWrap>
            {' '}
            {`${format.count(scannedContestResults.undervotes)} ${pluralize(
              'undervotes',
              scannedContestResults.undervotes
            )}`}
          </Font>
        </MetadataLabel>
      )}
      <ContestTable>
        <tbody>{contestTableRows}</tbody>
      </ContestTable>
    </Contest>
  );
}
