import React, { useContext } from 'react';
import { format, getBallotCount } from '@votingworks/utils';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { LinkButton, Table, TD } from '@votingworks/ui';
import {
  BatchTally,
  TallyCategory,
  VotingMethod,
  getLabelForVotingMethod,
} from '@votingworks/types';

import { getPartiesWithPrimaryElections } from '../utils/election';

import { AppContext } from '../contexts/app_context';
import { Loading } from './loading';
import { ExportBatchTallyResultsButton } from './export_batch_tally_results_button';
import { routerPaths } from '../router_paths';
import { getCardCounts } from '../api';

export interface Props {
  breakdownCategory: TallyCategory;
}

export function BallotCountsTable({
  breakdownCategory,
}: Props): JSX.Element | null {
  const {
    electionDefinition,
    isTabulationRunning,
    fullElectionTally,
    isOfficialResults,
  } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;

  const cardCountsQuery = getCardCounts.useQuery({
    groupBy: {
      groupByParty: breakdownCategory === TallyCategory.Party,
      groupByVotingMethod: breakdownCategory === TallyCategory.VotingMethod,
      groupByBatch: breakdownCategory === TallyCategory.Batch,
      groupByPrecinct: breakdownCategory === TallyCategory.Precinct,
      groupByScanner: breakdownCategory === TallyCategory.Scanner,
    },
  });

  if (isTabulationRunning || !cardCountsQuery.isSuccess) {
    return <Loading />;
  }

  const cardCountsByCategory = cardCountsQuery.data;
  const statusPrefix = isOfficialResults ? 'Official' : 'Unofficial';

  const totalBallotCount = cardCountsByCategory.reduce(
    (total, cardCounts) => total + getBallotCount(cardCounts),
    0
  );
  const totalManualBallotCount = cardCountsByCategory.reduce(
    (total, cardCounts) => total + (cardCounts.manual ?? 0),
    0
  );

  switch (breakdownCategory) {
    case TallyCategory.Precinct: {
      return (
        <Table>
          <tbody>
            <tr data-testid="table-row">
              <TD as="th" narrow>
                Precinct
              </TD>
              <TD as="th">Ballot Count</TD>
              <TD as="th">Report</TD>
            </tr>
            {[...election.precincts]
              .sort((a, b) =>
                a.name.localeCompare(b.name, undefined, {
                  ignorePunctuation: true,
                })
              )
              .map((precinct) => {
                const cardCounts = cardCountsByCategory.find(
                  (cc) => cc.precinctId === precinct.id
                );
                const ballotCount = cardCounts ? getBallotCount(cardCounts) : 0;

                return (
                  <tr key={precinct.id} data-testid="table-row">
                    <TD narrow nowrap>
                      {precinct.name}
                    </TD>
                    <TD>{format.count(ballotCount)}</TD>
                    <TD>
                      <LinkButton
                        small
                        to={routerPaths.tallyPrecinctReport({
                          precinctId: precinct.id,
                        })}
                      >
                        {statusPrefix} {precinct.name} Tally Report
                      </LinkButton>
                    </TD>
                  </tr>
                );
              })}
            <tr data-testid="table-row">
              <TD narrow nowrap>
                <strong>Total Ballot Count</strong>
              </TD>
              <TD>
                <strong data-testid="total-ballot-count">
                  {format.count(totalBallotCount)}
                </strong>
              </TD>
              <TD>
                <LinkButton
                  variant="primary"
                  small
                  to={routerPaths.tallyPrecinctReport({
                    precinctId: 'all',
                  })}
                >
                  {statusPrefix} Tally Reports for All Precincts
                </LinkButton>
              </TD>
            </tr>
          </tbody>
        </Table>
      );
    }
    case TallyCategory.Scanner: {
      return (
        <Table>
          <tbody>
            <tr data-testid="table-row">
              <TD as="th" narrow>
                Scanner ID
              </TD>
              <TD as="th">Ballot Count</TD>
              <TD as="th">Report</TD>
            </tr>
            {cardCountsByCategory
              .map((cc) => cc.scannerId)
              .filter((cc): cc is string => cc !== undefined)
              .sort((a, b) =>
                a.localeCompare(b, 'en', {
                  numeric: true,
                  ignorePunctuation: true,
                })
              )
              .map((scannerId) => {
                const cardCounts = find(
                  cardCountsByCategory,
                  (cc) => cc.scannerId === scannerId
                );
                const ballotCount = cardCounts ? getBallotCount(cardCounts) : 0;
                return (
                  <tr key={scannerId} data-testid="table-row">
                    <TD narrow nowrap>
                      {scannerId}
                    </TD>
                    <TD>{format.count(ballotCount)}</TD>
                    <TD>
                      <LinkButton
                        small
                        to={routerPaths.tallyScannerReport({
                          scannerId,
                        })}
                      >
                        {statusPrefix} Scanner {scannerId} Tally Report
                      </LinkButton>
                    </TD>
                  </tr>
                );
              })}
            {totalManualBallotCount ? (
              <tr data-testid="table-row" key="manual-data">
                <TD narrow nowrap>
                  Manually Entered Results
                </TD>
                <TD>{format.count(totalManualBallotCount)}</TD>
                <TD />
              </tr>
            ) : null}
            <tr data-testid="table-row">
              <TD narrow nowrap>
                <strong>Total Ballot Count</strong>
              </TD>
              <TD>
                <strong>{format.count(totalBallotCount)}</strong>
              </TD>
              <TD />
            </tr>
          </tbody>
        </Table>
      );
    }
    case TallyCategory.Party: {
      const partiesForPrimaries = getPartiesWithPrimaryElections(election);
      if (partiesForPrimaries.length === 0) {
        return null;
      }

      return (
        <Table>
          <tbody>
            <tr data-testid="table-row">
              <TD as="th" narrow>
                Party
              </TD>
              <TD as="th">Ballot Count</TD>
              <TD as="th">Report</TD>
            </tr>
            {[...partiesForPrimaries]
              .sort((a, b) =>
                a.fullName.localeCompare(b.fullName, undefined, {
                  ignorePunctuation: true,
                })
              )
              .map((party) => {
                const cardCounts = cardCountsByCategory.find(
                  (cc) => cc.partyId === party.id
                );
                const ballotCount = cardCounts ? getBallotCount(cardCounts) : 0;
                return (
                  <tr data-testid="table-row" key={party.id}>
                    <TD narrow nowrap>
                      {party.fullName}
                    </TD>
                    <TD>{format.count(ballotCount)}</TD>
                    <TD>
                      <LinkButton
                        small
                        to={routerPaths.tallyPartyReport({
                          partyId: party.id,
                        })}
                      >
                        {statusPrefix} {party.fullName} Tally Report
                      </LinkButton>
                    </TD>
                  </tr>
                );
              })}
            <tr data-testid="table-row">
              <TD narrow nowrap>
                <strong>Total Ballot Count</strong>
              </TD>
              <TD>
                <strong data-testid="total-ballot-count">
                  {format.count(totalBallotCount)}
                </strong>
              </TD>
              <TD />
            </tr>
          </tbody>
        </Table>
      );
    }
    case TallyCategory.VotingMethod: {
      return (
        <Table>
          <tbody>
            <tr data-testid="table-row">
              <TD as="th" narrow>
                Voting Method
              </TD>
              <TD as="th">Ballot Count</TD>
              <TD as="th">Report</TD>
            </tr>
            {Object.values(VotingMethod).map((votingMethod) => {
              const cardCounts = cardCountsByCategory.find(
                (cc) => cc.votingMethod === votingMethod
              );
              const ballotCount = cardCounts ? getBallotCount(cardCounts) : 0;
              if (votingMethod === VotingMethod.Unknown && ballotCount === 0) {
                return null;
              }
              const label = getLabelForVotingMethod(votingMethod);
              return (
                <tr key={votingMethod} data-testid="table-row">
                  <TD narrow nowrap>
                    {label}
                  </TD>
                  <TD>{format.count(ballotCount)}</TD>
                  <TD>
                    <LinkButton
                      small
                      to={routerPaths.tallyVotingMethodReport({
                        votingMethod,
                      })}
                    >
                      {statusPrefix} {label} Ballot Tally Report
                    </LinkButton>
                  </TD>
                </tr>
              );
            })}
            <tr data-testid="table-row">
              <TD narrow nowrap>
                <strong>Total Ballot Count</strong>
              </TD>
              <TD>
                <strong>{format.count(totalBallotCount)}</strong>
              </TD>
              <TD />
            </tr>
          </tbody>
        </Table>
      );
    }
    case TallyCategory.Batch: {
      const resultsByBatch =
        fullElectionTally?.resultsByCategory.get(TallyCategory.Batch) || {};

      return (
        <Table>
          <tbody>
            <tr data-testid="table-row">
              <TD as="th" narrow>
                Batch Name
              </TD>
              <TD as="th">Scanner</TD>
              <TD as="th">Ballot Count</TD>
              <TD as="th">Report</TD>
            </tr>
            {Object.keys(resultsByBatch).map((batchId) => {
              const batchTally = resultsByBatch[batchId] as BatchTally;
              const batchBallotsCount = batchTally.numberOfBallotsCounted;
              // This should only be multiple scanners if there are ballots missing batch ids
              return (
                <tr key={batchId} data-testid="table-row">
                  <TD narrow nowrap data-testid={`batch-${batchId}`}>
                    {batchTally.batchLabel}
                  </TD>
                  <TD>{batchTally.scannerIds.join(', ')}</TD>
                  <TD>{format.count(batchBallotsCount)}</TD>
                  <TD>
                    {batchBallotsCount > 0 && (
                      <LinkButton
                        small
                        to={routerPaths.tallyBatchReport({
                          batchId,
                        })}
                      >
                        {statusPrefix} {batchTally.batchLabel} Tally Report
                      </LinkButton>
                    )}
                  </TD>
                </tr>
              );
            })}
            {totalManualBallotCount ? (
              <tr data-testid="table-row" key="manual-data">
                <TD narrow nowrap data-testid="batch-manual">
                  Manually Entered Results
                </TD>
                <TD />
                <TD>{format.count(totalManualBallotCount)}</TD>
                <TD />
              </tr>
            ) : null}
            <tr data-testid="table-row">
              <TD narrow nowrap>
                <strong>Total Ballot Count</strong>
              </TD>
              <TD />
              <TD>
                <strong>{format.count(totalBallotCount)}</strong>
              </TD>
              <TD>
                <ExportBatchTallyResultsButton />
              </TD>
            </tr>
          </tbody>
        </Table>
      );
    }
    default:
      throwIllegalValue(breakdownCategory);
  }
}
