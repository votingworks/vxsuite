import React, { useState } from 'react';
import styled from 'styled-components';
import {
  BatteryStatus,
  Button,
  DateTimeDisplay,
  LockMachineButton,
  Modal,
  type ModalProps,
  ProgressBar,
  Toolbar,
  ToolbarButtons,
} from '@votingworks/ui';
import { throwIllegalValue } from '@votingworks/basics';
import { sharedLogOut, systemCallApi } from '../shared_api.js';
import {
  abortBackup,
  finishBackup,
  getBackupDriveStatus,
  getBackupStatus,
  startBackup,
} from '../api.js';

// During the save backup flow, which is a modal that takes over the screen, we
// still want to show the usual toolbar at the top so that users can lock the
// machine (if the backup is taking a while). We also include basic status info
// (battery, time), but not the full toolbar.

const FixedToolbar = styled(Toolbar)`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
`;

function FlowToolbar(): JSX.Element {
  const logOutMutation = sharedLogOut.useMutation();
  const batteryInfoQuery = systemCallApi.getBatteryInfo.useQuery();
  return (
    <FixedToolbar>
      {batteryInfoQuery.isSuccess && batteryInfoQuery.data && (
        <BatteryStatus batteryInfo={batteryInfoQuery.data} />
      )}
      <DateTimeDisplay />
      <ToolbarButtons>
        <LockMachineButton onLock={() => logOutMutation.mutate()} />
      </ToolbarButtons>
    </FixedToolbar>
  );
}

function ModalWithToolbar({ content, ...props }: ModalProps): JSX.Element {
  // A bit of an odd approach here: we render the toolbar inside the modal
  // content, but use CSS to fix it to the top of the screen. This has the
  // advantage that it automatically renders above the modal's overlay, avoiding
  // any z-index issues.
  return (
    <Modal
      {...props}
      content={
        <React.Fragment>
          <FlowToolbar />
          {content}
        </React.Fragment>
      }
    />
  );
}

function SaveBackupModal({
  onClose,
}: {
  onClose: () => void;
}): JSX.Element | null {
  const getBackupDriveStatusQuery = getBackupDriveStatus.usePollingQuery();
  const getBackupStatusQuery = getBackupStatus.usePollingQuery();
  const startBackupMutation = startBackup.useMutation();
  const abortBackupMutation = abortBackup.useMutation();
  const finishBackupMutation = finishBackup.useMutation();

  if (!getBackupDriveStatusQuery.isSuccess || !getBackupStatusQuery.isSuccess) {
    return null;
  }

  const backupDriveStatus = getBackupDriveStatusQuery.data;
  const backupStatus = getBackupStatusQuery.data;

  if (!backupStatus) {
    if (backupDriveStatus.status !== 'mounted') {
      return (
        <ModalWithToolbar
          title="Insert Backup Drive"
          content={<div>Insert a backup USB drive to continue.</div>}
          actions={<Button onPress={onClose}>Cancel</Button>}
          onOverlayClick={onClose}
        />
      );
    }
    return (
      <ModalWithToolbar
        title="Save Backup"
        content={<div>Last Backup: TODO</div>}
        actions={
          <React.Fragment>
            <Button
              variant="primary"
              onPress={() => startBackupMutation.mutate()}
              disabled={startBackupMutation.isLoading}
            >
              Save Backup
            </Button>
            <Button onPress={onClose} disabled={startBackupMutation.isLoading}>
              Cancel
            </Button>
          </React.Fragment>
        }
        onOverlayClick={onClose}
      />
    );
  }

  switch (backupStatus.status) {
    case 'starting':
    case 'in-progress': {
      const progressEvent =
        backupStatus.status === 'in-progress'
          ? backupStatus.lastProgressEvent
          : undefined;
      const progressContent = (() => {
        switch (progressEvent?.type) {
          case undefined:
          case '1_preparing':
          case '2_db_snapshot':
          case '3_staging_files':
            return (
              <React.Fragment>
                <ProgressBar progress={0} />
                <div>Preparing to save backup</div>
              </React.Fragment>
            );
          case '4_copying_files':
            return (
              <React.Fragment>
                <ProgressBar
                  progress={
                    progressEvent.copiedBytes / progressEvent.totalBytes
                  }
                />
                <div>Saving files to backup drive</div>
              </React.Fragment>
            );
          case '5_writing_manifest':
          case '6_flushing_backup':
          case '7_swapping_backup':
          case '8_flushing_swap':
            return (
              <React.Fragment>
                <ProgressBar progress={1} />
                <div>Finishing saving backup</div>
              </React.Fragment>
            );
          default:
            throwIllegalValue(progressEvent);
        }
      })();
      return (
        <ModalWithToolbar
          title="Saving Backup"
          content={
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              {progressContent}
            </div>
          }
          actions={
            <Button
              icon="Cancel"
              variant="danger"
              onPress={() => abortBackupMutation.mutate()}
              disabled={abortBackupMutation.isLoading}
            >
              Cancel Backup
            </Button>
          }
        />
      );
    }

    case 'ended': {
      function finishBackupAndClose() {
        finishBackupMutation.mutate(undefined, { onSuccess: onClose });
      }
      if (backupStatus.result.isOk()) {
        return (
          <ModalWithToolbar
            title="Backup Saved"
            content={<div>You may remove the backup drive.</div>}
            actions={
              <Button
                onPress={finishBackupAndClose}
                disabled={finishBackupMutation.isLoading}
              >
                Close
              </Button>
            }
            onOverlayClick={finishBackupAndClose}
          />
        );
      }
      if (backupStatus.result.err().type === 'cancelled') {
        return (
          <ModalWithToolbar
            title="Backup Cancelled"
            content={
              <div>
                The backup was cancelled. You may remove the backup drive.
              </div>
            }
            actions={
              <Button
                onPress={finishBackupAndClose}
                disabled={finishBackupMutation.isLoading}
              >
                Close
              </Button>
            }
            onOverlayClick={finishBackupAndClose}
          />
        );
      }
      // TODO show error details?
      return (
        <ModalWithToolbar
          title="Backup Failed"
          content={<div>The backup failed. Please try again.</div>}
          actions={
            <Button
              onPress={finishBackupAndClose}
              disabled={finishBackupMutation.isLoading}
            >
              Close
            </Button>
          }
          onOverlayClick={finishBackupAndClose}
        />
      );
    }

    default:
      throwIllegalValue(backupStatus);
  }
}

export function SaveBackupButton(): JSX.Element {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const getBackupStatusQuery = getBackupStatus.usePollingQuery();
  const isBackupInProgress = Boolean(getBackupStatusQuery.data);

  return (
    <React.Fragment>
      <Button icon="Backup" onPress={() => setIsModalOpen(true)}>
        Save Backup
      </Button>
      {(isModalOpen || isBackupInProgress) && (
        <SaveBackupModal onClose={() => setIsModalOpen(false)} />
      )}
    </React.Fragment>
  );
}
