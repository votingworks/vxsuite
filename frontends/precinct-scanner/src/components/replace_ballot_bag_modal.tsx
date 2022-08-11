import React, { useEffect, useState } from 'react';
import { Button, Text, Modal } from '@votingworks/ui';
import { throwIllegalValue } from '@votingworks/utils';
import { ScannedBallotCount } from './scanned_ballot_count';
import { CenteredLargeProse } from './layout';
import { BALLOT_BAG_CAPACITY } from '../config/globals';

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
              ballot bag.
            </p>
            <p>Insert a Poll Worker Card after the ballot bag is replaced.</p>
          </CenteredLargeProse>
        );
      case 'confirming':
        return (
          <CenteredLargeProse>
            <h1>Ready to Resume Voting?</h1>
            <p>
              Has the full ballot bag has been replaced with an empty ballot
              bag?
            </p>
            <p>
              <Button primary onPress={() => setModalState('confirmed')}>
                Yes, Resume Voting
              </Button>
            </p>
            <Text small italic>
              Remove card if you’re not ready to resume voting.
            </Text>
          </CenteredLargeProse>
        );
      case 'confirmed':
        return (
          <CenteredLargeProse>
            <h1>Ready to Resume Voting</h1>
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

/* istanbul ignore next */
export function Step1AlertPreview(): JSX.Element {
  return (
    <ReplaceBallotBagModal
      scannedBallotCount={BALLOT_BAG_CAPACITY}
      pollWorkerAuthenticated={false}
      onComplete={() => console.log('disabled')} // eslint-disable-line no-console
    />
  );
}
/* istanbul ignore next */
export function Step2ConfirmationPreview(): JSX.Element {
  return (
    <ReplaceBallotBagModal
      scannedBallotCount={BALLOT_BAG_CAPACITY}
      pollWorkerAuthenticated
      onComplete={() => console.log('disabled')} // eslint-disable-line no-console
    />
  );
}
