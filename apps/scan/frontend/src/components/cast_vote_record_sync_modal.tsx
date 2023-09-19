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

type ModalState = 'closed' | 'prompt' | 'syncing' | 'success' | 'error';

export function CastVoteRecordSyncModal(): JSX.Element | null {
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const exportCastVoteRecordsToUsbDriveMutation =
    exportCastVoteRecordsToUsbDrive.useMutation();

  const [modalState, setModalState] = useState<ModalState>('closed');

  useQueryChangeListener(usbDriveStatusQuery, (newUsbDriveStatus) => {
    if (newUsbDriveStatus.doesUsbDriveRequireCastVoteRecordSync) {
      setModalState('prompt');
    }
  });

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
          content={<P>CVRs need to be synced to the inserted USB drive.</P>}
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
