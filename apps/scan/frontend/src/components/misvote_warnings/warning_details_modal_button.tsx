import { Button, Modal, ModalWidth, WithScrollButtons } from '@votingworks/ui';
import React from 'react';
import { MisvoteWarningsProps } from './types';
import { WarningDetails } from './warning_details';

export function WarningDetailsModalButton(
  props: MisvoteWarningsProps
): JSX.Element {
  const { blankContests, overvoteContests, partiallyVotedContests } = props;
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  if (isModalOpen) {
    return (
      <Modal
        modalWidth={ModalWidth.Wide}
        content={
          <WithScrollButtons>
            <WarningDetails
              blankContests={blankContests}
              overvoteContests={overvoteContests}
              partiallyVotedContests={partiallyVotedContests}
            />
          </WithScrollButtons>
        }
        actions={
          <Button onPress={setIsModalOpen} value={false} variant="primary">
            Close
          </Button>
        }
        onOverlayClick={() => setIsModalOpen(false)}
      />
    );
  }

  return (
    <Button onPress={setIsModalOpen} value>
      View contests
    </Button>
  );
}
