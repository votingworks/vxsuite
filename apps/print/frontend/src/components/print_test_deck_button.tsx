import React, { useState } from 'react';
import styled from 'styled-components';
import { Button, Loading, Modal } from '@votingworks/ui';
import { getTestDeckBallotCount, printTestDeck } from '../api';

const DEFAULT_PROGRESS_MODAL_DELAY_SECONDS = 3;

const StyledButton = styled(Button)`
  width: 12rem;
`;

function PrintTestDeckModal({
  onClose,
}: {
  onClose: () => void;
}): JSX.Element | null {
  const printTestDeckMutation = printTestDeck.useMutation();
  const getTestDeckBallotCountQuery = getTestDeckBallotCount.useQuery();
  const [isShowingPrintingModal, setIsShowingPrintingModal] = useState(false);

  if (getTestDeckBallotCountQuery.data === undefined) {
    return null;
  }

  const ballotCount = getTestDeckBallotCountQuery.data;

  function handlePrint() {
    setIsShowingPrintingModal(true);
    setTimeout(() => {
      onClose();
    }, DEFAULT_PROGRESS_MODAL_DELAY_SECONDS * 1000);
    printTestDeckMutation.mutate();
  }

  if (isShowingPrintingModal) {
    return (
      <Modal
        centerContent
        content={
          <Loading animationDurationS={DEFAULT_PROGRESS_MODAL_DELAY_SECONDS}>
            Printing
          </Loading>
        }
      />
    );
  }

  return (
    <Modal
      title="Print Test Deck"
      content={<p>Print {ballotCount} test deck ballots and tally report?</p>}
      onOverlayClick={onClose}
      actions={
        <React.Fragment>
          <Button
            icon="Print"
            variant="primary"
            onPress={handlePrint}
            disabled={ballotCount === 0}
          >
            Print {ballotCount} Ballots
          </Button>
          <Button onPress={onClose}>Cancel</Button>
        </React.Fragment>
      }
    />
  );
}

export function PrintTestDeckButton({
  disabled,
}: {
  disabled: boolean;
}): JSX.Element {
  const [isShowingModal, setIsShowingModal] = useState(false);

  return (
    <React.Fragment>
      <StyledButton
        disabled={disabled}
        color="neutral"
        fill="outlined"
        onPress={() => setIsShowingModal(true)}
      >
        Print Test Deck
      </StyledButton>
      {isShowingModal && (
        <PrintTestDeckModal onClose={() => setIsShowingModal(false)} />
      )}
    </React.Fragment>
  );
}
