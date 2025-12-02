import {
  Button,
  Modal,
  ModalWidth,
  PageNavigationButtonId,
  WithScrollButtons,
  appStrings,
} from '@votingworks/ui';
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
          // TODO: Check whether the accessible input is a tactile controller vs. a PAT device and
          // only make the scroll buttons focusable when using a PAT device
          <WithScrollButtons focusable>
            <WarningDetails
              blankContests={blankContests}
              overvoteContests={overvoteContests}
              partiallyVotedContests={partiallyVotedContests}
            />
          </WithScrollButtons>
        }
        actions={
          <Button
            id={PageNavigationButtonId.NEXT_AFTER_CONFIRM}
            onPress={setIsModalOpen}
            value={false}
            variant="primary"
          >
            {appStrings.buttonClose()}
          </Button>
        }
        onOverlayClick={() => setIsModalOpen(false)}
      />
    );
  }

  return (
    <Button onPress={setIsModalOpen} value>
      {appStrings.buttonViewContests()}
    </Button>
  );
}
