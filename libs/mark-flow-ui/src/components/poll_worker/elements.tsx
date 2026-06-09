/* istanbul ignore file - currently tested via apps. */

import React from 'react';
import styled from 'styled-components';

import { assertDefined, find, throwIllegalValue } from '@votingworks/basics';
import {
  CardlessVoterUser,
  Election,
  getBallotStyle,
  getPartyForBallotStyle,
} from '@votingworks/types';
import { electionStrings, P, Font } from '@votingworks/ui';
import { getPrecinctsAndSplitsForBallotStyle } from '@votingworks/utils';

export interface BallotStyleLabelProps {
  election: Election;
  voter: CardlessVoterUser;
}

export function BallotStyleLabel(props: BallotStyleLabelProps): JSX.Element {
  const { election, voter } = props;
  const { precinctId, ballotStyleId } = voter;

  const ballotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId })
  );
  const precinctOrSplit = find(
    getPrecinctsAndSplitsForBallotStyle({ election, ballotStyle }),
    ({ precinct }) => precinct.id === precinctId
  );
  const precinctOrSplitName = precinctOrSplit.split
    ? electionStrings.precinctSplitName(precinctOrSplit.split)
    : electionStrings.precinctName(precinctOrSplit.precinct);

  switch (election.type) {
    case 'general':
    case 'open-primary':
      return (
        <P>
          <Font weight="semiBold">Ballot Style:</Font> {precinctOrSplitName}
        </P>
      );

    case 'closed-primary':
      return (
        <React.Fragment>
          <P>
            <Font weight="semiBold">Precinct:</Font> {precinctOrSplitName}
          </P>
          <P>
            <Font weight="semiBold">Ballot Style:</Font>{' '}
            {
              assertDefined(
                getPartyForBallotStyle({
                  election,
                  ballotStyleId: ballotStyle.id,
                })
              ).name
            }
          </P>
        </React.Fragment>
      );
    default:
      /* istanbul ignore next */
      throwIllegalValue(election.type);
  }
}

export const ButtonGrid = styled.div`
  display: grid;
  grid-auto-rows: 1fr;
  grid-gap: max(${(p) => p.theme.sizes.minTouchAreaSeparationPx}px, 0.25rem);
  grid-template-columns: 1fr 1fr;

  button {
    flex-wrap: nowrap;
    white-space: nowrap;
  }

  margin-top: 0.5rem;
`;

export const VotingSession = styled.div`
  margin: 30px 0 60px;
  border: 2px solid #000;
  border-radius: 20px;
  padding: 30px 40px;

  & > *:first-child {
    margin-top: 0;
  }

  & > *:last-child {
    margin-bottom: 0;
  }
`;
