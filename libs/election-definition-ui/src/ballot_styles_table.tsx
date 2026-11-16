import { Table, TH, TD, LinkButton, TabPanel, Font } from '@votingworks/ui';
import { useParams } from 'react-router-dom';
import { find } from '@votingworks/basics';
import { hasSplits } from '@votingworks/types';
import styled from 'styled-components';
import { ballotStyleHasPrecinctOrSplit } from '@votingworks/utils';
import { Column } from '@votingworks/election-definition-ui';
import {
  getBallotsFinalizedAt,
  listBallotStyles,
  getElectionInfo,
  electionDefinitionApi,
} from './api.js';
import { NestedTr } from './layout.js';
import { type ElectionIdParams, routes } from './routes.js';
import { BallotsStatus } from './ballots_status.js';

const BallotStylesTable = styled(Table)`
  td:last-child {
    text-align: right;
    padding-right: 1rem;
  }
`;

export function BallotStylesTab(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const getElectionInfoQuery = getElectionInfo.useQuery(electionId);
  const listPrecinctsQuery =
    electionDefinitionApi.listPrecincts.useQuery(electionId);
  const listBallotStylesQuery = listBallotStyles.useQuery(electionId);
  const listPartiesQuery =
    electionDefinitionApi.listParties.useQuery(electionId);
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);

  if (
    !(
      getElectionInfoQuery.isSuccess &&
      listPrecinctsQuery.isSuccess &&
      listBallotStylesQuery.isSuccess &&
      listPartiesQuery.isSuccess &&
      getBallotsFinalizedAtQuery.isSuccess
    )
  ) {
    return null;
  }

  const electionInfo = getElectionInfoQuery.data;
  const precincts = listPrecinctsQuery.data;
  const ballotStyles = listBallotStylesQuery.data;
  const parties = listPartiesQuery.data;
  const ballotRoutes = routes.election(electionId).ballots;
  const showPartyColumn =
    electionInfo.type === 'primary' && !electionInfo.isMiCombinedBallotPrimary;

  return (
    <TabPanel>
      <Column style={{ gap: '1rem', maxWidth: '40rem' }}>
        <BallotsStatus />

        {ballotStyles.length > 0 && (
          <BallotStylesTable>
            <thead>
              <tr>
                <TH>Precinct</TH>
                <TH>Ballot Style</TH>
                {showPartyColumn && <TH>Party</TH>}
                <TH />
              </tr>
            </thead>
            <tbody>
              {precincts.flatMap((precinct) => {
                if (!hasSplits(precinct)) {
                  const precinctBallotStyles = ballotStyles.filter(
                    (ballotStyle) => ballotStyle.precincts.includes(precinct.id)
                  );

                  if (precinctBallotStyles.length === 0) {
                    return (
                      <tr key={precinct.id}>
                        <TD>{precinct.name}</TD>
                        <TD>
                          <Font italic>No contests assigned</Font>
                        </TD>
                        {
                          // @coverage-exclude
                          showPartyColumn && <TD />
                        }
                        <TD />
                      </tr>
                    );
                  }

                  return precinctBallotStyles.map((ballotStyle) => (
                    <tr key={precinct.id + ballotStyle.id}>
                      <TD>{precinct.name}</TD>
                      <TD>{ballotStyle.id}</TD>
                      {showPartyColumn && (
                        <TD>
                          {
                            find(
                              parties,
                              (party) => party.id === ballotStyle.partyId
                            ).fullName
                          }
                        </TD>
                      )}
                      <TD>
                        <LinkButton
                          to={
                            ballotRoutes.viewBallot(ballotStyle.id, precinct.id)
                              .path
                          }
                        >
                          View Ballot
                        </LinkButton>
                      </TD>
                    </tr>
                  ));
                }

                const precinctRow = (
                  <tr key={precinct.id}>
                    <TD>{precinct.name}</TD>
                    <TD />
                    {showPartyColumn && <TD />}
                    <TD />
                  </tr>
                );

                const splitRows = precinct.splits.flatMap((split) => {
                  const splitBallotStyles = ballotStyles.filter((ballotStyle) =>
                    ballotStyleHasPrecinctOrSplit(ballotStyle, {
                      precinct,
                      split,
                    })
                  );

                  if (splitBallotStyles.length === 0) {
                    return (
                      <NestedTr key={split.id}>
                        <TD>{split.name}</TD>
                        <TD>
                          <Font italic>No contests assigned</Font>
                        </TD>
                        {
                          // @coverage-exclude
                          showPartyColumn && <TD />
                        }
                        <TD />
                      </NestedTr>
                    );
                  }

                  return splitBallotStyles.map((ballotStyle) => (
                    <NestedTr key={split.id + ballotStyle.id}>
                      <TD>{split.name}</TD>
                      <TD>{ballotStyle.id}</TD>
                      {showPartyColumn && (
                        <TD>
                          {
                            find(
                              parties,
                              (party) => party.id === ballotStyle.partyId
                            ).fullName
                          }
                        </TD>
                      )}
                      <TD>
                        <LinkButton
                          to={
                            ballotRoutes.viewBallot(ballotStyle.id, precinct.id)
                              .path
                          }
                        >
                          View Ballot
                        </LinkButton>
                      </TD>
                    </NestedTr>
                  ));
                });

                return [precinctRow, ...splitRows];
              })}
            </tbody>
          </BallotStylesTable>
        )}
      </Column>
    </TabPanel>
  );
}
