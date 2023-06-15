import React, { useContext } from 'react';
import { format, getBallotCount } from '@votingworks/utils';
import { assert, find, throwIllegalValue } from '@votingworks/basics';
import { LinkButton, Table, TD } from '@votingworks/ui';
import { Tabulation, TallyCategory } from '@votingworks/types';

import { getPartiesWithPrimaryElections } from '../utils/election';

import { AppContext } from '../contexts/app_context';
import { Loading } from './loading';
import { ExportBatchTallyResultsButton } from './export_batch_tally_results_button';
import { routerPaths } from '../router_paths';
import {
  getCardCounts,
  getManualResultsMetadata,
  getScannerBatches,
} from '../api';

export interface Props {
  breakdownCategory: TallyCategory;
}

export function BallotCountsTable({
  breakdownCategory,
}: Props): JSX.Element | null {
  const { electionDefinition, isOfficialResults } = useContext(AppContext);
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
  const scannerBatchesQuery = getScannerBatches.useQuery();
  const manualResultsMetadataQuery = getManualResultsMetadata.useQuery();

  if (
    !cardCountsQuery.isSuccess ||
    !scannerBatchesQuery.isSuccess ||
    !manualResultsMetadataQuery.isSuccess
  ) {
    return <Loading />;
  }

  const cardCountsByCategory = cardCountsQuery.data;
  const statusPrefix = isOfficialResults ? 'Official' : 'Unofficial';

  // depending on the category, combinedCategoryBallotCount may or may not include manual
  // counts. specifically, it is not included for batch and scanner categories.
  const combinedCategoryBallotCount = cardCountsByCategory.reduce(
    (total, cardCounts) => total + getBallotCount(cardCounts),
    0
  );
  const totalManualBallotCount = manualResultsMetadataQuery.data.reduce(
    (total, metadata) => total + metadata.ballotCount,
    0
  );

  const totalBallotCount =
    breakdownCategory === TallyCategory.Batch ||
    breakdownCategory === TallyCategory.Scanner
      ? combinedCategoryBallotCount + totalManualBallotCount
      : combinedCategoryBallotCount;

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
      const votingMethods: Tabulation.VotingMethod[] = ['absentee', 'precinct'];
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
            {votingMethods.map((votingMethod) => {
              const cardCounts = cardCountsByCategory.find(
                (cc) => cc.votingMethod === votingMethod
              );
              const ballotCount = cardCounts ? getBallotCount(cardCounts) : 0;

              const label =
                votingMethod === 'absentee' ? 'Absentee' : 'Precinct';
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
            {cardCountsByCategory.map(({ batchId, ...cardCounts }) => {
              assert(batchId !== undefined);
              const batch = find(
                scannerBatchesQuery.data,
                (b) => b.batchId === batchId
              );
              const ballotCount = getBallotCount(cardCounts);
              return (
                <tr key={batchId} data-testid="table-row">
                  <TD narrow nowrap data-testid={`batch-${batchId}`}>
                    {batch.label}
                  </TD>
                  <TD>{batch.scannerId}</TD>
                  <TD>{format.count(ballotCount)}</TD>
                  <TD>
                    {ballotCount > 0 && (
                      <LinkButton
                        small
                        to={routerPaths.tallyBatchReport({
                          batchId,
                        })}
                      >
                        {statusPrefix} {batch.label} Tally Report
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
    // istanbul ignore next
    default:
      throwIllegalValue(breakdownCategory);
  }
}
