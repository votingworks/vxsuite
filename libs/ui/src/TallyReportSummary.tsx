import React from 'react';
import styled from 'styled-components';

import {
  Dictionary,
  VotingMethod,
  getLabelForVotingMethod,
} from '@votingworks/types';

import { format } from '@votingworks/utils';
import { Table, TD } from './Table';

const BallotSummary = styled.div`
  margin-bottom: 1em;
  border: 1px solid rgb(194, 200, 203);
  border-width: 0 1px;
  h3 {
    margin: 0;
    background: rgb(194, 200, 203);
    padding: 0.25rem 0.5rem;
  }
`;

interface Props {
  totalBallotCount: number;
  ballotCountsByVotingMethod: Dictionary<number>;
}

export const TallyReportSummary = ({
  totalBallotCount,
  ballotCountsByVotingMethod,
}: Props): JSX.Element => {
  return (
    <BallotSummary>
      <h3>Ballots by Voting Method</h3>
      <Table data-testid="voting-method-table">
        <tbody>
          {Object.values(VotingMethod).map((votingMethod) => {
            if (!(votingMethod in ballotCountsByVotingMethod)) {
              return null;
            }
            // Hide the "Other" row when it does not apply to any CVRs
            if (
              votingMethod === VotingMethod.Unknown &&
              ballotCountsByVotingMethod[votingMethod] === 0
            ) {
              return null;
            }
            return (
              <tr key={votingMethod} data-testid={votingMethod}>
                <TD>{getLabelForVotingMethod(votingMethod)}</TD>
                <TD textAlign="right">
                  {format.count(
                    ballotCountsByVotingMethod[votingMethod] ??
                      /* istanbul ignore next */ 0
                  )}
                </TD>
              </tr>
            );
          })}
          <tr data-testid="total">
            <TD>
              <strong>Total Ballots Cast</strong>
            </TD>
            <TD textAlign="right">
              <strong>{format.count(totalBallotCount)}</strong>
            </TD>
          </tr>
        </tbody>
      </Table>
    </BallotSummary>
  );
};
