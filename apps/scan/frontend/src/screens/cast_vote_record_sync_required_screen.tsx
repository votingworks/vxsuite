import { useState } from 'react';
import { throwIllegalValue } from '@votingworks/basics';
import {
  Button,
  FullScreenIconWrapper,
  Icons,
  Loading,
  Modal,
  P,
} from '@votingworks/ui';

import { exportCastVoteRecordsToUsbDrive } from '../api';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';
import { ScreenMainCenterChild } from '../components/layout';

type BlockedAction = 'close_polls';

const CAST_VOTE_RECORD_SYNC_REQUIRED_PROMPTS: Record<
  BlockedAction | 'default',
  string
> = {
  default:
    'The inserted USB drive does not contain up-to-date records of the votes cast at this scanner. ' +
    'Cast vote records (CVRs) need to be synced to the USB drive.',
  close_polls:
    'Cast vote records (CVRs) need to be synced to the inserted USB drive before you can close polls. ' +
    'Remove your poll worker card to sync.',
};

type ModalState = 'closed' | 'syncing' | 'success' | 'error';

interface Props {
  setShouldStayOnCastVoteRecordSyncRequiredScreen: (
    shouldStayOnCastVoteRecordSyncRequiredScreen: boolean
  ) => void;
}

export function CastVoteRecordSyncRequiredScreen({
  setShouldStayOnCastVoteRecordSyncRequiredScreen,
}: Props): JSX.Element {
  const exportCastVoteRecordsToUsbDriveMutation =
    exportCastVoteRecordsToUsbDrive.useMutation();

  const [modalState, setModalState] = useState<ModalState>('closed');

  function syncCastVoteRecords() {
    setShouldStayOnCastVoteRecordSyncRequiredScreen(true);
    setModalState('syncing');
    exportCastVoteRecordsToUsbDriveMutation.mutate(
      { mode: 'recovery_export' },
      {
        onSuccess: (result) => {
          if (result.isErr()) {
            setModalState('error');
            return;
          }
          setModalState('success');
        },
      }
    );
  }

  function closeModal() {
    setModalState('closed');
    setShouldStayOnCastVoteRecordSyncRequiredScreen(false);
  }

  const modal = (() => {
    switch (modalState) {
      case 'closed': {
        return null;
      }
      case 'syncing': {
        return <Modal content={<Loading>Syncing CVRs</Loading>} />;
      }
      case 'error': {
        return (
          <Modal
            title="CVR Sync Error"
            content={<P>Try inserting a different USB drive.</P>}
            actions={<Button onPress={closeModal}>Close</Button>}
            onOverlayClick={closeModal}
          />
        );
      }
      case 'success': {
        return (
          <Modal
            title="CVR Sync Complete"
            content={<P>Voters may continue casting ballots.</P>}
            actions={<Button onPress={closeModal}>Close</Button>}
            onOverlayClick={closeModal}
          />
        );
      }
      /* istanbul ignore next: Compile-time check for completeness */
      default: {
        throwIllegalValue(modalState);
      }
    }
  })();

  return (
    <ScreenMainCenterChild>
      <FullScreenPromptLayout
        title="CVR Sync Required"
        image={
          <FullScreenIconWrapper>
            <Icons.Warning color="warning" />
          </FullScreenIconWrapper>
        }
      >
        <P>{CAST_VOTE_RECORD_SYNC_REQUIRED_PROMPTS.default}</P>
        <P>
          <Button variant="primary" onPress={syncCastVoteRecords}>
            Sync CVRs
          </Button>
        </P>
      </FullScreenPromptLayout>
      {modal}
    </ScreenMainCenterChild>
  );
}

interface CastVoteRecordSyncRequiredModalProps {
  blockedAction: BlockedAction;
  closeModal: () => void;
}

/**
 * A secondary modal for explaining that an action is blocked until cast vote records have been
 * synced. Nudges users toward the primary {@link CastVoteRecordSyncRequiredScreen}.
 */
export function CastVoteRecordSyncRequiredModal({
  blockedAction,
  closeModal,
}: CastVoteRecordSyncRequiredModalProps): JSX.Element {
  return (
    <Modal
      title="CVR Sync Required"
      content={<P>{CAST_VOTE_RECORD_SYNC_REQUIRED_PROMPTS[blockedAction]}</P>}
      actions={<Button onPress={closeModal}>Cancel</Button>}
      onOverlayClick={closeModal}
    />
  );
}
