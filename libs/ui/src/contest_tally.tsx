import React from 'react';
import styled from 'styled-components';
import pluralize from 'pluralize';

import {
  Election,
  expandEitherNeitherContests,
  ExternalTally,
  PrecinctId,
  Tally,
} from '@votingworks/types';
import {
  assert,
  getContestVoteOptionsForCandidateContest,
  getContestVoteOptionsForYesNoContest,
  combineContestTallies,
  throwIllegalValue,
} from '@votingworks/utils';

import { Prose } from './prose';
import { Text, NoWrap } from './text';
import { tableBorderColor } from './table';

interface ContestProps {
  dim?: boolean;
}

const Contest = styled.div<ContestProps>`
  margin: 1rem 0;
  color: ${({ dim }) => (dim ? '#cccccc' : undefined)};
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
  & tr.metadata.metadatarow {
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
    padding: 0 0.5rem;
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
  tallyRelevant,
  tally,
  manualSubTallyRelevant,
  manualSubTally,
}: {
  testId: string;
  optionLabel: string;
  tallyRelevant: boolean;
  tally?: number;
  manualSubTallyRelevant: boolean;
  manualSubTally: number;
}): JSX.Element {
  if (tallyRelevant && manualSubTallyRelevant) {
    // If the tally is relevant but undefined (which may not be possible)
    // then we infer the tally is equal to the manual tally
    const inferredTally = tally ?? manualSubTally;
    return (
      <tr data-testid={testId}>
        <th>{optionLabel}</th>
        <td>{inferredTally - manualSubTally}</td>
        <td>
          {manualSubTally === 0 ? (
            <Muted>{manualSubTally}</Muted>
          ) : (
            manualSubTally
          )}
        </td>
        <td>
          <strong>{inferredTally}</strong>
        </td>
      </tr>
    );
  }

  return (
    <tr data-testid={testId}>
      <th colSpan={3}>{optionLabel}</th>
      <td>{tallyRelevant && (tally ?? 'X')}</td>
    </tr>
  );
}

function ContestMetadataRow({
  label,
  total,
  manualSubtotal,
  isLast,
}: {
  label: string;
  total: number;
  manualSubtotal: number;
  isLast?: boolean;
}): JSX.Element {
  return (
    <tr className={`metadata ${isLast ? '' : 'metadatarow'}`}>
      <th>
        <em>{label}</em>
      </th>
      <td>{total - manualSubtotal}</td>
      <td>
        {manualSubtotal === 0 ? (
          <Muted>{manualSubtotal}</Muted>
        ) : (
          manualSubtotal
        )}
      </td>
      <td>
        <strong>{total}</strong>
      </td>
    </tr>
  );
}

interface Props {
  election: Election;
  scannedTally: Tally;
  manualTally?: ExternalTally;
  otherExternalTallies?: ExternalTally[];
  precinctId?: PrecinctId;
}

export function ContestTally({
  election,
  scannedTally,
  manualTally,
  otherExternalTallies = [],
  precinctId,
}: Props): JSX.Element {
  // if there is no precinctId defined, we don't need to do extra work
  // that will later be ignored, so we just use the empty array
  const ballotStyles = precinctId
    ? election.ballotStyles.filter((bs) => bs.precincts.includes(precinctId))
    : [];
  const districts = ballotStyles.flatMap((bs) => bs.districts);

  return (
    <React.Fragment>
      {expandEitherNeitherContests(election.contests).map((contest) => {
        if (!(contest.id in scannedTally.contestTallies)) {
          return null;
        }
        const scannedContestTally = scannedTally.contestTallies[contest.id];
        assert(scannedContestTally);

        const hasManualTally = Boolean(manualTally);
        const manualContestTally = manualTally?.contestTallies[contest.id];
        const {
          ballots: manualBallots = 0,
          overvotes: manualOvervotes = 0,
          undervotes: manualUndervotes = 0,
        } = manualContestTally?.metadata ?? {};

        const otherExternalContestTallies = otherExternalTallies.map(
          (t) => t.contestTallies[contest.id]
        );

        let overallContestTally = scannedContestTally;
        for (const externalContestTally of [
          manualContestTally,
          ...otherExternalContestTallies,
        ]) {
          if (externalContestTally !== undefined) {
            overallContestTally = combineContestTallies(
              overallContestTally,
              externalContestTally
            );
          }
        }

        const { tallies, metadata } = overallContestTally;

        const talliesRelevant = precinctId
          ? districts.includes(contest.districtId)
          : true;

        const { ballots, overvotes, undervotes } = metadata;

        const contestOptionTableRows: JSX.Element[] = [];
        switch (contest.type) {
          case 'candidate': {
            const candidates =
              getContestVoteOptionsForCandidateContest(contest);
            for (const candidate of candidates) {
              const key = `${contest.id}-${candidate.id}`;
              const candidateTally = tallies[candidate.id]?.tally;
              const manualCandidateTally =
                manualContestTally?.tallies[candidate.id]?.tally;
              contestOptionTableRows.push(
                <ContestOptionRow
                  key={key}
                  testId={key}
                  optionLabel={candidate.name}
                  tally={candidateTally}
                  tallyRelevant={talliesRelevant}
                  manualSubTally={manualCandidateTally ?? 0}
                  manualSubTallyRelevant={hasManualTally}
                />
              );
            }
            break;
          }
          case 'yesno': {
            const voteOptions = getContestVoteOptionsForYesNoContest(contest);
            for (const option of voteOptions) {
              const key = `${contest.id}-${option}`;
              const optionTally = tallies[option]?.tally;
              const manualOptionTally =
                manualContestTally?.tallies[option]?.tally;
              const choiceName = option === 'yes' ? 'Yes' : 'No';
              contestOptionTableRows.push(
                <ContestOptionRow
                  key={key}
                  testId={key}
                  optionLabel={choiceName}
                  tally={optionTally}
                  tallyRelevant={talliesRelevant}
                  manualSubTally={manualOptionTally ?? 0}
                  manualSubTallyRelevant={hasManualTally}
                />
              );
            }
            break;
          }
          default:
            throwIllegalValue(contest, 'type');
        }

        let contestTableRows: JSX.Element[];

        if (hasManualTally) {
          contestTableRows = [
            <tr className="metadata header" key={`${contest.id}-header`}>
              <th> </th>
              <th>scanned</th>
              <th>manual</th>
              <th>
                <strong>total</strong>
              </th>
            </tr>,
            <ContestMetadataRow
              label="Ballots Cast"
              key={`${contest.id}-ballots-cast`}
              total={ballots}
              manualSubtotal={manualBallots}
            />,
            <ContestMetadataRow
              label="Overvotes"
              key={`${contest.id}-overvotes`}
              total={overvotes}
              manualSubtotal={manualOvervotes}
            />,
            <ContestMetadataRow
              label="Undervotes"
              key={`${contest.id}-undervotes`}
              total={undervotes}
              manualSubtotal={manualUndervotes}
              isLast
            />,
            ...contestOptionTableRows,
          ];
        } else {
          contestTableRows = contestOptionTableRows;
        }

        return (
          <Contest key={`div-${contest.id}`} dim={!talliesRelevant}>
            <Prose maxWidth={false} data-testid={`results-table-${contest.id}`}>
              {contest.section !== contest.title && (
                <Text small>{contest.section}</Text>
              )}
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
              {!hasManualTally && (
                <Text small>
                  <NoWrap>{pluralize('ballots', ballots, true)} cast /</NoWrap>{' '}
                  <NoWrap> {pluralize('overvotes', overvotes, true)} /</NoWrap>{' '}
                  <NoWrap> {pluralize('undervotes', undervotes, true)}</NoWrap>
                </Text>
              )}
              <ContestTable>
                <tbody>{contestTableRows}</tbody>
              </ContestTable>
            </Prose>
          </Contest>
        );
      })}
    </React.Fragment>
  );
}
