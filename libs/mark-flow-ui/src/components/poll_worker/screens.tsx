/* istanbul ignore file - @preserve - currently tested via apps. */

import React from 'react';

import { Icons, P, RemoveCardImage } from '@votingworks/ui';
import { Election, CardlessVoterUser } from '@votingworks/types';
import { CenteredCardPageLayout } from '../centered_card_page_layout';

import { BallotStyleLabel } from './elements';

export interface ScreenBeginVotingProps {
  election: Election;
  resetVoterSessionButton: React.ReactNode;
  voter: CardlessVoterUser;
}

export function ScreenBeginVoting(props: ScreenBeginVotingProps): JSX.Element {
  const { election, resetVoterSessionButton, voter } = props;

  return (
    <CenteredCardPageLayout
      buttons={resetVoterSessionButton}
      icon={
        <div
          style={{
            height: '5rem',
            margin: '0 0.5rem 0 1rem',
            position: 'relative',
            left: '-1rem',
            top: '-6.5rem',
          }}
        >
          <RemoveCardImage aria-hidden cardInsertionDirection="up" />
        </div>
      }
      title="Remove Card to Begin Voting Session"
      voterFacing={false}
    >
      <BallotStyleLabel election={election} voter={voter} />
      <P>
        <Icons.Info /> Replace headphone ear covers with a new set.
      </P>
    </CenteredCardPageLayout>
  );
}

export interface ScreenVotingInProgressProps {
  election: Election;
  resetVoterSessionButton: React.ReactNode;
  voter: CardlessVoterUser;
}

export function ScreenVotingInProgress(
  props: ScreenVotingInProgressProps
): JSX.Element {
  const { election, resetVoterSessionButton, voter } = props;

  return (
    <CenteredCardPageLayout
      title="Voting Session Paused"
      icon={<Icons.Paused />}
      voterFacing={false}
    >
      <P weight="bold">Remove card to continue voting session.</P>
      <BallotStyleLabel election={election} voter={voter} />
      <P>{resetVoterSessionButton}</P>
    </CenteredCardPageLayout>
  );
}
