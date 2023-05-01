import React, { useContext } from 'react';
import { format } from '@votingworks/utils';
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
    fullElectionManualTally,
    isOfficialResults,
  } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;

  if (isTabulationRunning) {
    return <Loading />;
  }

  const statusPrefix = isOfficialResults ? 'Official' : 'Unofficial';

  const totalBallotCountInternal =
    fullElectionTally?.overallTally.numberOfBallotsCounted ?? 0;
  const totalBallotCountManual =
    fullElectionManualTally?.overallTally.numberOfBallotsCounted ?? 0;

  switch (breakdownCategory) {
    case TallyCategory.Precinct: {
      const resultsByPrecinct =
        fullElectionTally?.resultsByCategory.get(TallyCategory.Precinct) || {};
      const manualResultsByPrecinct =
        fullElectionManualTally?.resultsByCategory.get(
          TallyCategory.Precinct
        ) || {};
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
                const precinctBallotsCount =
                  resultsByPrecinct[precinct.id]?.numberOfBallotsCounted ?? 0;
                const manualPrecinctBallotsCount =
                  manualResultsByPrecinct[precinct.id]
                    ?.numberOfBallotsCounted ?? 0;
                return (
                  <tr key={precinct.id} data-testid="table-row">
                    <TD narrow nowrap>
                      {precinct.name}
                    </TD>
                    <TD>
                      {format.count(
                        precinctBallotsCount + manualPrecinctBallotsCount
                      )}
                    </TD>
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
                  {format.count(
                    totalBallotCountInternal + totalBallotCountManual
                  )}
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
      const resultsByScanner =
        fullElectionTally?.resultsByCategory.get(TallyCategory.Scanner) || {};

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
            {Object.keys(resultsByScanner)
              .sort((a, b) =>
                a.localeCompare(b, 'en', {
                  numeric: true,
                  ignorePunctuation: true,
                })
              )
              .map((scannerId) => {
                const scannerBallotsCount =
                  resultsByScanner[scannerId]?.numberOfBallotsCounted ?? 0;
                return (
                  <tr key={scannerId} data-testid="table-row">
                    <TD narrow nowrap>
                      {scannerId}
                    </TD>
                    <TD>{format.count(scannerBallotsCount)}</TD>
                    <TD>
                      {scannerBallotsCount > 0 && (
                        <LinkButton
                          small
                          to={routerPaths.tallyScannerReport({
                            scannerId,
                          })}
                        >
                          {statusPrefix} Scanner {scannerId} Tally Report
                        </LinkButton>
                      )}
                    </TD>
                  </tr>
                );
              })}
            {fullElectionManualTally ? (
              <tr data-testid="table-row" key="manual-data">
                <TD narrow nowrap>
                  Manually Entered Results
                </TD>
                <TD>
                  {format.count(
                    fullElectionManualTally.overallTally.numberOfBallotsCounted
                  )}
                </TD>
                <TD />
              </tr>
            ) : null}
            <tr data-testid="table-row">
              <TD narrow nowrap>
                <strong>Total Ballot Count</strong>
              </TD>
              <TD>
                <strong>
                  {format.count(
                    totalBallotCountInternal + totalBallotCountManual
                  )}
                </strong>
              </TD>
              <TD />
            </tr>
          </tbody>
        </Table>
      );
    }
    case TallyCategory.Party: {
      const resultsByParty =
        fullElectionTally?.resultsByCategory.get(TallyCategory.Party) || {};
      const manualResultsByParty =
        fullElectionManualTally?.resultsByCategory.get(TallyCategory.Party) ||
        {};
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
                const partyBallotsCount =
                  resultsByParty[party.id]?.numberOfBallotsCounted ?? 0;
                const manualPartyBallotsCount =
                  manualResultsByParty[party.id]?.numberOfBallotsCounted ?? 0;
                return (
                  <tr data-testid="table-row" key={party.id}>
                    <TD narrow nowrap>
                      {party.fullName}
                    </TD>
                    <TD>
                      {format.count(
                        partyBallotsCount + manualPartyBallotsCount
                      )}
                    </TD>
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
                  {format.count(
                    totalBallotCountInternal + totalBallotCountManual
                  )}
                </strong>
              </TD>
              <TD />
            </tr>
          </tbody>
        </Table>
      );
    }
    case TallyCategory.VotingMethod: {
      const resultsByVotingMethod =
        fullElectionTally?.resultsByCategory.get(TallyCategory.VotingMethod) ||
        {};
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
              const internalVotingMethodBallotsCount =
                resultsByVotingMethod[votingMethod]?.numberOfBallotsCounted ??
                0;
              const manualVotingMethodBallotsCount =
                votingMethod === fullElectionManualTally?.votingMethod
                  ? fullElectionManualTally.overallTally.numberOfBallotsCounted
                  : 0;
              const votingMethodBallotsCount =
                internalVotingMethodBallotsCount +
                manualVotingMethodBallotsCount;
              if (
                votingMethod === VotingMethod.Unknown &&
                votingMethodBallotsCount === 0
              ) {
                return null;
              }
              const label = getLabelForVotingMethod(votingMethod);
              return (
                <tr key={votingMethod} data-testid="table-row">
                  <TD narrow nowrap>
                    {label}
                  </TD>
                  <TD>{format.count(votingMethodBallotsCount)}</TD>
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
                <strong>
                  {format.count(
                    totalBallotCountInternal + totalBallotCountManual
                  )}
                </strong>
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
            {fullElectionManualTally ? (
              <tr data-testid="table-row" key="manual-data">
                <TD narrow nowrap data-testid="batch-manual">
                  Manually Entered Results
                </TD>
                <TD />
                <TD>
                  {format.count(
                    fullElectionManualTally.overallTally.numberOfBallotsCounted
                  )}
                </TD>
                <TD />
              </tr>
            ) : null}
            <tr data-testid="table-row">
              <TD narrow nowrap>
                <strong>Total Ballot Count</strong>
              </TD>
              <TD />
              <TD>
                <strong>
                  {format.count(
                    totalBallotCountInternal + totalBallotCountManual
                  )}
                </strong>
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
