import { Main, Screen, H1, Table, Button } from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import { useCallback } from 'react';
import { getBallots, getElectionDefinition, printBallot } from './api';

export function BallotListScreen(): JSX.Element | null {
  const getBallotsQuery = getBallots.useQuery();
  const electionDefinitionQuery = getElectionDefinition.useQuery();
  const printBallotMutation = printBallot.useMutation();
  const printBallotMutateFn = printBallotMutation.mutate;

  const onPressPrint = useCallback(
    (ballotPrintId: string) => {
      printBallotMutateFn({ ballotPrintId });
    },
    [printBallotMutateFn]
  );

  if (!getBallotsQuery.isSuccess || !electionDefinitionQuery.isSuccess) {
    return null;
  }

  const ballots = getBallotsQuery.data;
  const electionDefinition = electionDefinitionQuery.data;
  assert(electionDefinition);

  return (
    <Screen>
      <Main padded>
        <H1>Ballots</H1>
        <Table condensed>
          <thead>
            <tr>
              <td>Ballot Style ID</td>
              <td>Precinct</td>
              <td>Type</td>
              <td>Mode</td>
              <td>Print</td>
            </tr>
          </thead>
          <tbody>
            {ballots.map((ballot) => {
              const {
                ballotStyleId,
                precinctId,
                ballotType,
                ballotMode,
                ballotPrintId,
              } = ballot;
              return (
                <tr key={ballotStyleId}>
                  <td>{ballotStyleId}</td>
                  <td>{precinctId}</td>
                  <td>{ballotType}</td>
                  <td>{ballotMode}</td>
                  <td>
                    <Button onPress={() => onPressPrint(ballotPrintId)}>
                      Print
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Main>
    </Screen>
  );
}
