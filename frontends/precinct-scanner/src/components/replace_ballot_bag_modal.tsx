import React, { useEffect, useState } from 'react';
import { Button, Modal } from '@votingworks/ui';
import { throwIllegalValue } from '@votingworks/utils';
import { ScannedBallotCount } from './scanned_ballot_count';
import { CenteredLargeProse } from './layout';

interface Props {
  scannedBallotCount: number;
  pollWorkerAuthenticated: boolean;
  onComplete: VoidFunction;
}

type ModalState = 'no_auth' | 'confirming' | 'confirmed';

export function ReplaceBallotBagModal({
  scannedBallotCount,
  pollWorkerAuthenticated,
  onComplete,
}: Props): JSX.Element {
  const [modalState, setModalState] = useState<ModalState>('no_auth');

  useEffect(() => {
    if (modalState === 'no_auth' && pollWorkerAuthenticated) {
      setModalState('confirming');
    } else if (modalState === 'confirming' && !pollWorkerAuthenticated) {
      setModalState('no_auth');
    } else if (modalState === 'confirmed' && !pollWorkerAuthenticated) {
      onComplete();
    }
  }, [modalState, onComplete, pollWorkerAuthenticated]);

  const mainContent = (() => {
    switch (modalState) {
      case 'no_auth':
        return (
          <CenteredLargeProse>
            <h1>The Ballot Bag is Full</h1>
            <p>
              A Poll Worker must replace the full ballot bag with an empty
              ballot bag. Insert a Poll Worker Card to confirm replacement and
              to resume voting.
            </p>
          </CenteredLargeProse>
        );
      case 'confirming':
        return (
          <CenteredLargeProse>
            <h1>Ready to Resume Voting?</h1>
            <p>
              Confirm that the full ballot bag has been replaced with an empty
              ballot bag.
            </p>
            <Button primary onPress={() => setModalState('confirmed')}>
              Yes, Resume Voting
            </Button>
            <p>
              <em>Remove card if you’re not ready to resume voting.</em>
            </p>
          </CenteredLargeProse>
        );
      case 'confirmed':
        return (
          <CenteredLargeProse>
            <h1>Resume Voting</h1>
            <p>Remove the Poll Worker Card to continue.</p>
          </CenteredLargeProse>
        );
      /* istanbul ignore next - compile time check for completeness */
      default:
        throwIllegalValue(modalState);
    }
  })();

  return (
    <Modal
      fullscreen
      centerContent
      content={
        <React.Fragment>
          <ScannedBallotCount count={scannedBallotCount} />
          {mainContent}
        </React.Fragment>
      }
    />
  );
}
