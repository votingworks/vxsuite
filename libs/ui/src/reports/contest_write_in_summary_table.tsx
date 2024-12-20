import styled from 'styled-components';

import {
  Election,
  getContestDistrictName,
  Tabulation,
} from '@votingworks/types';

import { find } from '@votingworks/basics';
import pluralize from 'pluralize';
import { format } from '@votingworks/utils';
import { TD, TH } from '../table';
import { Caption, Font, FontProps } from '../typography';
import { reportColors } from './layout';

const Contest = styled.div`
  margin: 2.5em 0;
  page-break-inside: avoid;

  h3 {
    margin-top: 0;
    margin-bottom: 0.5em;

    & + p {
      margin-top: -0.5em;
      margin-bottom: 0.25em;
    }

    & + table {
      margin-top: -0.5em;
    }
  }

  p:first-child {
    margin: 0;
  }
`;

const ContestTable = styled.table`
  width: 100%;
  border-collapse: collapse;

  & tr {
    border-top: 1px solid ${reportColors.outline};
    border-bottom: 1px solid ${reportColors.outline};
  }

  & tr.empty-row {
    border-bottom: none;
  }

  & td {
    padding: 0.2em;
    padding-right: 0;
  }

  & th {
    padding: 0.25em;
    text-align: left;
    font-weight: 400;
  }

  & th.indent {
    padding-left: 2.5em;
  }
`;

interface Props {
  election: Election;
  contestWriteInSummary: Tabulation.ContestWriteInSummary;
}

function TallyRow({
  label,
  tally,
  weight,
  indent,
}: {
  label: string;
  tally?: number;
  weight?: FontProps['weight'];
  indent?: boolean;
}): JSX.Element {
  return (
    <tr>
      <TH
        className={indent ? 'indent' : undefined}
        colSpan={tally === undefined ? 2 : 1}
      >
        <Font weight={weight}>{label}</Font>
      </TH>
      {tally !== undefined && (
        <TD narrow textAlign="right">
          {format.count(tally)}
        </TD>
      )}
    </tr>
  );
}

export function ContestWriteInSummaryTable({
  election,
  contestWriteInSummary,
}: Props): JSX.Element {
  const contest = find(
    election.contests,
    (c) => c.id === contestWriteInSummary.contestId
  );

  const candidateTallies = Object.values(
    contestWriteInSummary.candidateTallies
  ).filter((c) => c.tally > 0);
  const officialCandidateTallies = candidateTallies.filter((c) => !c.isWriteIn);
  const writeInCandidateTallies = candidateTallies.filter((c) => c.isWriteIn);

  const rows: JSX.Element[] = [];

  if (officialCandidateTallies.length > 0) {
    rows.push(
      <TallyRow
        key="official-candidate-header"
        label="Official Candidates"
        weight="semiBold"
      />
    );
    for (const officialCandidateTally of officialCandidateTallies) {
      rows.push(
        <TallyRow
          key={officialCandidateTally.id}
          label={officialCandidateTally.name}
          tally={officialCandidateTally.tally}
          indent
        />
      );
    }
  }

  if (writeInCandidateTallies.length > 0) {
    rows.push(
      <TallyRow
        key="write-in-candidate-header"
        label="Write-In Candidates"
        weight="semiBold"
      />
    );
    for (const writeInCandidateTally of writeInCandidateTallies) {
      rows.push(
        <TallyRow
          key={writeInCandidateTally.id}
          label={writeInCandidateTally.name}
          tally={writeInCandidateTally.tally}
          indent
        />
      );
    }
  }

  if (contestWriteInSummary.invalidTally) {
    rows.push(
      <TallyRow
        key="invalid"
        label="Invalid"
        tally={contestWriteInSummary.invalidTally}
        weight="semiBold"
      />
    );
  }

  return (
    <Contest data-testid={`results-table-${contest.id}`}>
      <p>{getContestDistrictName(election, contest)}</p>
      <h3>{contest.title}</h3>
      <Caption>
        <Font noWrap>
          {`${format.count(contestWriteInSummary.totalTally)} ${pluralize(
            'total write-ins',
            contestWriteInSummary.totalTally
          )}`}{' '}
          /
        </Font>{' '}
        <Font noWrap>
          {format.count(contestWriteInSummary.pendingTally)} not adjudicated
        </Font>
      </Caption>
      <ContestTable>
        <tbody>
          {rows.length > 0 ? (
            rows
          ) : (
            <tr className="empty-row">
              <th />
            </tr>
          )}
        </tbody>
      </ContestTable>
    </Contest>
  );
}
