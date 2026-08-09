import styled from 'styled-components';
import pluralize from 'pluralize';

import {
  Election,
  getContestDistrictName,
  Tabulation,
  Contest,
} from '@votingworks/types';
import {
  format,
  getSeparatedTallyReportCandidateRows,
  getTallyReportCandidateRows,
} from '@votingworks/utils';
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
  tally,
  separateManualTally,
}: {
  testId: string;
  optionLabel: string;
  tally: number;
  separateManualTally?: number;
}): JSX.Element {
  if (separateManualTally === undefined) {
    return (
      <tr data-testid={testId}>
        <th colSpan={3}>{optionLabel}</th>
        <td>{format.count(tally)}</td>
      </tr>
    );
  }

  return (
    <tr data-testid={testId}>
      {/* the narrow label column needs a non-breaking hyphen to keep names
          like "Smith-Jones" from wrapping mid-name */}
      <th className="option-label">{optionLabel.replace('-', '‑')}</th>
      <td>{format.count(tally)}</td>
      <td>
        {separateManualTally === 0 ? (
          <Muted>{format.count(separateManualTally)}</Muted>
        ) : (
          format.count(separateManualTally)
        )}
      </td>
      <td>
        <strong>{format.count(tally + separateManualTally)}</strong>
      </td>
    </tr>
  );
}

function ContestMetadataRow({
  label,
  tally,
  separateManualTally,
  isLast,
}: {
  label: string;
  tally: number;
  separateManualTally: number;
  isLast?: boolean;
}): JSX.Element {
  return (
    <tr className={`metadata ${isLast ? '' : 'last-metadata'}`}>
      <th>
        <em>{label}</em>
      </th>
      <td>{format.count(tally)}</td>
      <td>
        {separateManualTally === 0 ? (
          <Muted>{format.count(separateManualTally)}</Muted>
        ) : (
          format.count(separateManualTally)
        )}
      </td>
      <td>
        <strong>{format.count(tally + separateManualTally)}</strong>
      </td>
    </tr>
  );
}

interface Props {
  election: Election;
  contest: Contest;
  contestResults: Tabulation.ContestResults;
  /**
   * Manually entered results to show in a column of their own, alongside the
   * results they supplement. Without them, the table shows a single column of
   * tallies, whatever their provenance.
   */
  separateManualContestResults?: Tabulation.ContestResults;
  aggregateInsignificantWriteIns?: boolean;
}

interface CandidateOptionRow {
  id: string;
  name: string;
  tally: number;
  separateManualTally?: number;
}

// eslint-disable-next-line vx/gts-no-return-type-only-generics
function assertIsOptional<T>(_value?: unknown): asserts _value is Optional<T> {
  // noop
}

export function ContestResultsTable({
  election,
  contest,
  contestResults,
  separateManualContestResults,
  aggregateInsignificantWriteIns = true,
}: Props): JSX.Element {
  // When the manual results have a column of their own, the metadata is
  // included as table rows rather than as an above table caption.
  const contestTableRows: JSX.Element[] = separateManualContestResults
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
          tally={contestResults.ballots}
          separateManualTally={separateManualContestResults.ballots}
        />,
        <ContestMetadataRow
          label="Overvotes"
          key={`${contest.id}-overvotes`}
          tally={contestResults.overvotes}
          separateManualTally={separateManualContestResults.overvotes}
        />,
        <ContestMetadataRow
          label="Undervotes"
          key={`${contest.id}-undervotes`}
          tally={contestResults.undervotes}
          separateManualTally={separateManualContestResults.undervotes}
          isLast
        />,
      ]
    : [];

  switch (contest.type) {
    case 'candidate': {
      assert(contestResults.contestType === 'candidate');
      assertIsOptional<Tabulation.CandidateContestResults>(
        separateManualContestResults
      );
      const candidateRows: CandidateOptionRow[] = separateManualContestResults
        ? getSeparatedTallyReportCandidateRows({
            contest,
            contestResults,
            separateManualContestResults,
            aggregateInsignificantWriteIns,
          }).map(({ manualTally, ...row }) => ({
            ...row,
            separateManualTally: manualTally,
          }))
        : getTallyReportCandidateRows({
            contest,
            contestResults,
            aggregateInsignificantWriteIns,
          });
      for (const candidateRow of candidateRows) {
        const key = `${contest.id}-${candidateRow.id}`;
        contestTableRows.push(
          <ContestOptionRow
            key={key}
            testId={key}
            optionLabel={candidateRow.name}
            tally={candidateRow.tally}
            separateManualTally={candidateRow.separateManualTally}
          />
        );
      }
      break;
    }
    case 'yesno': {
      assert(contestResults.contestType === 'yesno');
      assertIsOptional<Tabulation.YesNoContestResults>(
        separateManualContestResults
      );
      for (const option of contest.options) {
        const key = `${contest.id}-${option.id}`;
        contestTableRows.push(
          <ContestOptionRow
            key={key}
            testId={key}
            optionLabel={option.label}
            tally={contestResults.tallies[option.id] ?? 0}
            separateManualTally={
              separateManualContestResults
                ? separateManualContestResults.tallies[option.id] ?? 0
                : undefined
            }
          />
        );
      }
      break;
    }
    case 'straight-party': {
      assert(contestResults.contestType === 'straight-party');
      assertIsOptional<Tabulation.StraightPartyContestResults>(
        separateManualContestResults
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
            tally={contestResults.tallies[partyId]}
            separateManualTally={
              separateManualContestResults
                ? separateManualContestResults.tallies[partyId] ?? 0
                : undefined
            }
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
      {!separateManualContestResults && (
        <MetadataLabel>
          <Font noWrap>
            {`${format.count(contestResults.ballots)} ${pluralize(
              'ballots',
              contestResults.ballots
            )}`}{' '}
            cast /
          </Font>{' '}
          <Font noWrap>
            {' '}
            {`${format.count(contestResults.overvotes)} ${pluralize(
              'overvotes',
              contestResults.overvotes
            )}`}{' '}
            /
          </Font>{' '}
          <Font noWrap>
            {' '}
            {`${format.count(contestResults.undervotes)} ${pluralize(
              'undervotes',
              contestResults.undervotes
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
