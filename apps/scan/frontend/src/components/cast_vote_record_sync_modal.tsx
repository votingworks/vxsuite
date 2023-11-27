import { useState } from 'react';
import { throwIllegalValue } from '@votingworks/basics';
import {
  Button,
  Loading,
  Modal,
  P,
  useQueryChangeListener,
} from '@votingworks/ui';

import { exportCastVoteRecordsToUsbDrive, getUsbDriveStatus } from '../api';

type BlockedAction =
  | 'close_polls'
  | 'delete_election_data'
  | 'switch_to_test_mode';

export const CAST_VOTE_RECORD_SYNC_MODAL_PROMPTS: Record<
  BlockedAction | 'default',
  string
> = {
  default:
    'The inserted USB drive does not contain up-to-date records of the votes cast at this scanner. ' +
    'Cast vote records (CVRs) need to be synced to the USB drive.',
  close_polls:
    'Cast vote records (CVRs) need to be synced to the inserted USB drive before you can close polls. ' +
    'Remove your poll worker card to sync.',
  delete_election_data:
    'Cast vote records (CVRs) need to be synced to the inserted USB drive before you can delete election data. ' +
    'Remove your election manager card to sync.',
  switch_to_test_mode:
    'Cast vote records (CVRs) need to be synced to the inserted USB drive before you can switch to test mode. ' +
    'Remove your election manager card to sync.',
};

type ModalState = 'closed' | 'prompt' | 'syncing' | 'success' | 'error';

export function CastVoteRecordSyncModal(): JSX.Element | null {
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const exportCastVoteRecordsToUsbDriveMutation =
    exportCastVoteRecordsToUsbDrive.useMutation();

  const [modalState, setModalState] = useState<ModalState>('closed');

  useQueryChangeListener(
    usbDriveStatusQuery,
    ({ doesUsbDriveRequireCastVoteRecordSync }) =>
      doesUsbDriveRequireCastVoteRecordSync,
    (doesUsbDriveRequireCastVoteRecordSync) => {
      if (doesUsbDriveRequireCastVoteRecordSync) {
        setModalState('prompt');
      }
    }
  );

  function syncCastVoteRecords() {
    setModalState('syncing');
    exportCastVoteRecordsToUsbDriveMutation.mutate(
      { mode: 'full_export' },
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
  }

  switch (modalState) {
    case 'closed': {
      return null;
    }
    case 'prompt': {
      return (
        <Modal
          title="CVR Sync Required"
          content={<P>{CAST_VOTE_RECORD_SYNC_MODAL_PROMPTS.default}</P>}
          actions={
            <Button variant="primary" onPress={syncCastVoteRecords}>
              Sync CVRs
            </Button>
          }
        />
      );
    }
    case 'syncing': {
      return <Modal content={<Loading>Syncing CVRs</Loading>} />;
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
    case 'error': {
      return (
        <Modal
          title="CVR Sync Error"
          content={<P>Try inserting a different USB drive.</P>}
        />
      );
    }
    /* istanbul ignore next: Compile-time check for completeness */
    default: {
      throwIllegalValue(modalState);
    }
  }
}

interface CastVoteRecordSyncReminderModalProps {
  blockedAction: BlockedAction;
  closeModal: () => void;
}

/**
 * A secondary modal for explaining that an action is blocked until cast vote records have been
 * synced. Nudges users toward the primary {@link CastVoteRecordSyncModal}.
 */
export function CastVoteRecordSyncReminderModal({
  blockedAction,
  closeModal,
}: CastVoteRecordSyncReminderModalProps): JSX.Element {
  return (
    <Modal
      title="CVR Sync Required"
      content={<P>{CAST_VOTE_RECORD_SYNC_MODAL_PROMPTS[blockedAction]}</P>}
      actions={<Button onPress={closeModal}>Cancel</Button>}
      onOverlayClick={closeModal}
    />
  );
}
