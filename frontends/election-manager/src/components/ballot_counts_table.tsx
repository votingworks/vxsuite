import React, { useContext } from 'react';
import { throwIllegalValue, format } from '@votingworks/utils';
import { strict as assert } from 'assert';
import { Table, TD } from '@votingworks/ui';
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
import { LinkButton } from './link_button';
import { routerPaths } from '../router_paths';

export interface Props {
  breakdownCategory: TallyCategory;
}

export function BallotCountsTable({ breakdownCategory }: Props): JSX.Element {
  const {
    electionDefinition,
    isTabulationRunning,
    fullElectionTally,
    fullElectionExternalTallies,
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
  const totalBallotCountExternal = fullElectionExternalTallies.reduce(
    (prev, tally) => prev + tally.overallTally.numberOfBallotsCounted,
    0
  );

  switch (breakdownCategory) {
    case TallyCategory.Precinct: {
      const resultsByPrecinct =
        fullElectionTally?.resultsByCategory.get(TallyCategory.Precinct) || {};
      const externalResultsByPrecinct = fullElectionExternalTallies.map(
        (t) => t.resultsByCategory.get(TallyCategory.Precinct) || {}
      );
      return (
        <Table>
          <tbody>
            <tr data-testid="table-row">
              <TD as="th" narrow>
                Precinct
              </TD>
              <TD as="th">Ballot Count</TD>
              <TD as="th">View Tally</TD>
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
                const externalPrecinctBallotsCount = externalResultsByPrecinct.reduce(
                  (prev, talliesByPrecinct) => {
                    return (
                      prev +
                      (talliesByPrecinct[precinct.id]?.numberOfBallotsCounted ??
                        0)
                    );
                  },
                  0
                );
                return (
                  <tr key={precinct.id} data-testid="table-row">
                    <TD narrow nowrap>
                      {precinct.name}
                    </TD>
                    <TD>
                      {format.count(
                        precinctBallotsCount + externalPrecinctBallotsCount
                      )}
                    </TD>
                    <TD>
                      <LinkButton
                        small
                        to={routerPaths.tallyPrecinctReport({
                          precinctId: precinct.id,
                        })}
                      >
                        View {statusPrefix} {precinct.name} Tally Report
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
                    totalBallotCountInternal + totalBallotCountExternal
                  )}
                </strong>
              </TD>
              <TD>
                <LinkButton
                  small
                  to={routerPaths.tallyPrecinctReport({
                    precinctId: 'all',
                  })}
                >
                  View {statusPrefix} Tally Reports for All Precincts
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
        <React.Fragment>
          <Table>
            <tbody>
              <tr data-testid="table-row">
                <TD as="th" narrow>
                  Scanner ID
                </TD>
                <TD as="th">Ballot Count</TD>
                <TD as="th">View Tally</TD>
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
                            View {statusPrefix} Scanner {scannerId} Tally Report
                          </LinkButton>
                        )}
                      </TD>
                    </tr>
                  );
                })}
              {fullElectionExternalTallies.map((t) => (
                <tr data-testid="table-row" key={t.inputSourceName}>
                  <TD narrow nowrap>
                    External Results ({t.inputSourceName})
                  </TD>
                  <TD>{format.count(t.overallTally.numberOfBallotsCounted)}</TD>
                  <TD />
                </tr>
              ))}
              <tr data-testid="table-row">
                <TD narrow nowrap>
                  <strong>Total Ballot Count</strong>
                </TD>
                <TD>
                  <strong>
                    {format.count(
                      totalBallotCountInternal + totalBallotCountExternal
                    )}
                  </strong>
                </TD>
                <TD />
              </tr>
            </tbody>
          </Table>
        </React.Fragment>
      );
    }
    case TallyCategory.Party: {
      const resultsByParty =
        fullElectionTally?.resultsByCategory.get(TallyCategory.Party) || {};
      const externalResultsByParty = fullElectionExternalTallies.map(
        (t) => t.resultsByCategory.get(TallyCategory.Party) || {}
      );
      const partiesForPrimaries = getPartiesWithPrimaryElections(election);
      if (partiesForPrimaries.length === 0) {
        return <React.Fragment />;
      }

      return (
        <Table>
          <tbody>
            <tr data-testid="table-row">
              <TD as="th" narrow>
                Party
              </TD>
              <TD as="th">Ballot Count</TD>
              <TD as="th">View Tally</TD>
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
                const externalPartyBallotsCount = externalResultsByParty.reduce(
                  (prev, talliesByParty) =>
                    prev +
                    (talliesByParty[party.id]?.numberOfBallotsCounted ?? 0),
                  0
                );
                return (
                  <tr data-testid="table-row" key={party.id}>
                    <TD narrow nowrap>
                      {party.fullName}
                    </TD>
                    <TD>
                      {format.count(
                        partyBallotsCount + externalPartyBallotsCount
                      )}
                    </TD>
                    <TD>
                      <LinkButton
                        small
                        to={routerPaths.tallyPartyReport({
                          partyId: party.id,
                        })}
                      >
                        View {statusPrefix} {party.fullName} Tally Report
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
                    totalBallotCountInternal + totalBallotCountExternal
                  )}
                </strong>
              </TD>
              <TD>
                <LinkButton small to={routerPaths.tallyFullReport}>
                  View {statusPrefix} Full Election Tally Report
                </LinkButton>
              </TD>
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
              <TD as="th">View Tally</TD>
            </tr>
            {Object.values(VotingMethod).map((votingMethod) => {
              const initialBallotsCountedByVotingMethod =
                resultsByVotingMethod[votingMethod]?.numberOfBallotsCounted ??
                0;
              const votingMethodBallotsCount =
                // Include external results as appropriate
                fullElectionExternalTallies
                  .filter((t) => t.votingMethod === votingMethod)
                  .reduce(
                    (prev, t) => prev + t.overallTally.numberOfBallotsCounted,
                    initialBallotsCountedByVotingMethod
                  );

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
                      View {statusPrefix} {label} Ballot Tally Report
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
                    totalBallotCountInternal + totalBallotCountExternal
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
              <TD as="th">View Tally</TD>
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
                        View {statusPrefix} {batchTally.batchLabel} Tally Report
                      </LinkButton>
                    )}
                  </TD>
                </tr>
              );
            })}
            {fullElectionExternalTallies.map((t) => (
              <tr data-testid="table-row" key={t.inputSourceName}>
                <TD narrow nowrap data-testid="batch-external">
                  External Results ({t.inputSourceName})
                </TD>
                <TD>{format.count(t.overallTally.numberOfBallotsCounted)}</TD>
                <TD />
              </tr>
            ))}
            <tr data-testid="table-row">
              <TD narrow nowrap>
                <strong>Total Ballot Count</strong>
              </TD>
              <TD>
                <strong>
                  {format.count(
                    totalBallotCountInternal + totalBallotCountExternal
                  )}
                </strong>
              </TD>
              <TD />
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
