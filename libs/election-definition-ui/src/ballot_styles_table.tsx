import { Table, TH, TD, LinkButton, Font } from '@votingworks/ui';
import { find } from '@votingworks/basics';
import {
  type BallotStyle,
  type BallotStyleId,
  type ElectionId,
  hasSplits,
  type PrecinctId,
} from '@votingworks/types';
import styled from 'styled-components';
import { ballotStyleHasPrecinctOrSplit } from '@votingworks/utils';
import { useElectionDefinitionApi } from './election_definition_context.js';

const NestedTr = styled.tr`
  td:first-child {
    padding-left: 3rem;
  }
`;

const StyledTable = styled(Table)`
  td:last-child {
    text-align: right;
    padding-right: 1rem;
  }
`;

export interface BallotStylesTableProps {
  electionId: ElectionId;
  getViewBallotPath?: (
    ballotStyleId: BallotStyleId,
    precinctId: PrecinctId
  ) => string;
}

export function BallotStylesTable({
  electionId,
  getViewBallotPath,
}: BallotStylesTableProps): JSX.Element | null {
  const api = useElectionDefinitionApi();
  const getElectionInfoQuery = api.getElectionInfo.useQuery(electionId);
  const listPrecinctsQuery = api.listPrecincts.useQuery(electionId);
  const listBallotStylesQuery = api.listBallotStyles.useQuery(electionId);
  const listPartiesQuery = api.listParties.useQuery(electionId);

  if (
    !(
      getElectionInfoQuery.isSuccess &&
      listPrecinctsQuery.isSuccess &&
      listBallotStylesQuery.isSuccess &&
      listPartiesQuery.isSuccess
    )
  ) {
    return null;
  }

  function viewBallotButton(
    ballotStyle: BallotStyle,
    precinctId: PrecinctId
  ): JSX.Element | undefined {
    return (
      getViewBallotPath && (
        <LinkButton to={getViewBallotPath(ballotStyle.id, precinctId)}>
          View Ballot
        </LinkButton>
      )
    );
  }

  const electionInfo = getElectionInfoQuery.data;
  const precincts = listPrecinctsQuery.data;
  const ballotStyles = listBallotStylesQuery.data;
  const parties = listPartiesQuery.data;
  const showPartyColumn =
    electionInfo.type === 'primary' && !electionInfo.isMiCombinedBallotPrimary;

  if (ballotStyles.length === 0) {
    return null;
  }

  return (
    <StyledTable>
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
            const precinctBallotStyles = ballotStyles.filter((ballotStyle) =>
              ballotStyle.precincts.includes(precinct.id)
            );

            if (precinctBallotStyles.length === 0) {
              return (
                <tr key={precinct.id}>
                  <TD>{precinct.name}</TD>
                  <TD>
                    <Font italic>No contests assigned</Font>
                  </TD>
                  {showPartyColumn && <TD />}
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
                      find(parties, (party) => party.id === ballotStyle.partyId)
                        .fullName
                    }
                  </TD>
                )}
                <TD>{viewBallotButton(ballotStyle, precinct.id)}</TD>
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
                  {showPartyColumn && <TD />}
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
                      find(parties, (party) => party.id === ballotStyle.partyId)
                        .fullName
                    }
                  </TD>
                )}
                <TD>{viewBallotButton(ballotStyle, precinct.id)}</TD>
              </NestedTr>
            ));
          });

          return [precinctRow, ...splitRows];
        })}
      </tbody>
    </StyledTable>
  );
}
