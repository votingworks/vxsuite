import {
  Button,
  Callout,
  FullScreenMessage,
  H2,
  Icons,
  type ModalProps,
  P,
  ProgressBar,
  UsbDriveImage,
} from '@votingworks/ui';
import { iter, throwIllegalValue } from '@votingworks/basics';
import React, { useState } from 'react';
import styled from 'styled-components';
import type {
  AvailableBackup,
  RestoreStatus,
} from '@votingworks/admin-backend';
import { RestoreNavScreen } from '../components/restore_nav_screen.js';
import {
  abortRestore,
  finishRestore,
  getBackupDriveStatus,
  getRestoreStatus,
  listAvailableBackups,
  logOut,
  startRestore,
  systemCallApi,
} from '../api.js';
import { BackupDetails } from '../../components/backup_details.js';
import { ModalWithToolbar } from '../../components/modal_with_toolbar.js';

function Modal(props: ModalProps): JSX.Element {
  const logOutMutation = logOut.useMutation();
  const batteryInfoQuery = systemCallApi.getBatteryInfo.useQuery();
  return (
    <ModalWithToolbar
      {...props}
      batteryInfo={batteryInfoQuery.data}
      onLock={() => logOutMutation.mutate()}
    />
  );
}

function StartRestoreModal({
  backup,
  onClose,
}: {
  backup: AvailableBackup;
  onClose: () => void;
}): JSX.Element {
  const startRestoreMutation = startRestore.useMutation();
  const isStarting =
    startRestoreMutation.isLoading || startRestoreMutation.isSuccess;
  return (
    <Modal
      title="Restore from Backup"
      content={
        <React.Fragment>
          <P>Restore from this backup?</P>
          <BackupDetails manifest={backup.manifestResult.unsafeUnwrap()} />
        </React.Fragment>
      }
      actions={
        <React.Fragment>
          <Button
            variant="primary"
            onPress={() =>
              startRestoreMutation.mutate({ backupPath: backup.path })
            }
            disabled={isStarting}
          >
            Restore
          </Button>
          <Button onPress={onClose} disabled={isStarting}>
            Cancel
          </Button>
        </React.Fragment>
      }
      onOverlayClick={onClose}
    />
  );
}

function RestoreProgressModal({
  restoreStatus,
  onClose,
}: {
  restoreStatus: RestoreStatus;
  onClose?: () => void;
}): JSX.Element {
  const abortRestoreMutation = abortRestore.useMutation();
  const finishRestoreMutation = finishRestore.useMutation();
  const rebootMutation = systemCallApi.reboot.useMutation();

  switch (restoreStatus.status) {
    case 'starting':
    case 'in-progress': {
      const progressEvent =
        restoreStatus.status === 'in-progress'
          ? restoreStatus.lastProgressEvent
          : undefined;
      const progressContent = (() => {
        switch (progressEvent?.type) {
          case undefined:
          case '1_preparing':
            return (
              <React.Fragment>
                <ProgressBar progress={0} />
                <div>Preparing to restore backup</div>
              </React.Fragment>
            );
          case '2_copying_files':
            return (
              <React.Fragment>
                <ProgressBar
                  progress={
                    progressEvent.copiedBytes / progressEvent.totalBytes
                  }
                />
                <div>Restoring files from backup drive</div>
              </React.Fragment>
            );
          case '3_verifying':
          case '4_flushing_workspace':
            return (
              <React.Fragment>
                <ProgressBar progress={1} />
                <div>Finishing restore</div>
              </React.Fragment>
            );
          default:
            throwIllegalValue(progressEvent);
        }
      })();
      return (
        <Modal
          title="Restoring from Backup"
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
              onPress={() => abortRestoreMutation.mutate()}
              disabled={abortRestoreMutation.isLoading}
            >
              Cancel Restore
            </Button>
          }
        />
      );
    }
    case 'ended': {
      function finishRestoreAndClose() {
        onClose?.();
        finishRestoreMutation.mutate();
      }
      if (restoreStatus.result.isOk()) {
        return (
          <Modal
            title="Restore Complete"
            content={
              <P>
                You may remove the backup drive. Restart VxAdmin to continue.
              </P>
            }
            actions={
              <Button
                variant="primary"
                onPress={() => rebootMutation.mutate()}
                disabled={rebootMutation.isLoading || rebootMutation.isSuccess}
              >
                Restart
              </Button>
            }
          />
        );
      }
      if (restoreStatus.result.err().type === 'canceled') {
        return (
          <Modal
            title="Restore Canceled"
            content={<P>The restore was canceled.</P>}
            actions={
              <Button
                onPress={finishRestoreAndClose}
                disabled={finishRestoreMutation.isLoading}
              >
                Close
              </Button>
            }
            onOverlayClick={finishRestoreAndClose}
          />
        );
      }
      // TODO do we want to show more detailed error info?
      return (
        <Modal
          title="Restore Failed"
          content={<P>The restore failed. Please try again.</P>}
          actions={
            <Button
              onPress={finishRestoreAndClose}
              disabled={finishRestoreMutation.isLoading}
            >
              Close
            </Button>
          }
          onOverlayClick={finishRestoreAndClose}
        />
      );
    }

    default:
      throwIllegalValue(restoreStatus);
  }
}

function RestoreFlowModal({
  backup,
  restoreStatus,
  onClose,
}: {
  backup?: AvailableBackup;
  restoreStatus?: RestoreStatus | null;
  onClose: () => void;
}): JSX.Element | null {
  if (restoreStatus) {
    return (
      <RestoreProgressModal restoreStatus={restoreStatus} onClose={onClose} />
    );
  }
  if (backup) {
    return <StartRestoreModal backup={backup} onClose={onClose} />;
  }
  return null;
}

const BackupItem = styled.div`
  cursor: pointer;
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;

  &:hover {
    background-color: ${(p) => p.theme.colors.containerLow};
    outline: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
      ${(p) => p.theme.colors.primary};
  }
`;

function BackupList({
  setBackupToConfirm,
}: {
  setBackupToConfirm: (backup: AvailableBackup) => void;
}): JSX.Element {
  const listAvailableBackupsQuery = listAvailableBackups.useQuery();

  if (!listAvailableBackupsQuery.isSuccess) {
    return (
      <div>
        <Icons.Loading /> Loading backups...
      </div>
    );
  }

  const listBackupsResult = listAvailableBackupsQuery.data;

  if (listBackupsResult.isErr()) {
    return (
      <Callout icon="Danger" color="danger">
        Failed to load backups from the inserted backup drive
      </Callout>
    );
  }

  const backups = listBackupsResult.ok();

  if (backups.length === 0) {
    return (
      <Callout icon="Info" color="neutral">
        No backups found on the inserted backup drive
      </Callout>
    );
  }

  const [okBackups, errBackups] = iter(backups).partition((backup) =>
    backup.manifestResult.isOk()
  );
  // eslint-disable-next-line vx/no-array-sort-mutation
  okBackups.sort(
    (a, b) =>
      new Date(b.manifestResult.unsafeUnwrap().createdAt).getTime() -
      new Date(a.manifestResult.unsafeUnwrap().createdAt).getTime()
  );

  return (
    <div>
      <H2 style={{ marginBottom: '1rem' }}>Select a backup to restore from</H2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {okBackups.map((backup) => (
          <BackupItem
            key={backup.path}
            onClick={() => setBackupToConfirm(backup)}
          >
            <BackupDetails manifest={backup.manifestResult.unsafeUnwrap()} />
          </BackupItem>
        ))}
        {errBackups.length > 0 && (
          <Callout icon="Warning" color="warning">
            <div>
              <P>Failed to load some backups on the backup drive:</P>
              <ul style={{ margin: 0 }}>
                {errBackups.map((backup) => (
                  <li key={backup.path}>{backup.name}</li>
                ))}
              </ul>
            </div>
          </Callout>
        )}
      </div>
    </div>
  );
}

function SelectBackupScreen({
  restoreStatus,
}: {
  restoreStatus?: RestoreStatus | null;
}): JSX.Element {
  const [backupToConfirm, setBackupToConfirm] = useState<AvailableBackup>();
  return (
    <React.Fragment>
      <BackupList setBackupToConfirm={setBackupToConfirm} />
      <RestoreFlowModal
        backup={backupToConfirm}
        restoreStatus={restoreStatus}
        onClose={() => setBackupToConfirm(undefined)}
      />
    </React.Fragment>
  );
}

export function RestoreScreen(): JSX.Element | null {
  const getRestoreStatusQuery = getRestoreStatus.usePollingQuery();
  const getBackupDriveStatusQuery = getBackupDriveStatus.usePollingQuery();

  if (
    !getBackupDriveStatusQuery.isSuccess ||
    !getRestoreStatusQuery.isSuccess
  ) {
    return null;
  }

  const title = 'Restore from Backup';
  const backupDriveStatus = getBackupDriveStatusQuery.data;
  const restoreStatus = getRestoreStatusQuery.data;

  if (backupDriveStatus.status !== 'mounted') {
    return (
      <RestoreNavScreen title={title}>
        <FullScreenMessage
          title="Insert a backup USB drive"
          image={<UsbDriveImage />}
        />
        {restoreStatus && (
          <RestoreProgressModal restoreStatus={restoreStatus} />
        )}
      </RestoreNavScreen>
    );
  }

  return (
    <RestoreNavScreen title={title}>
      <SelectBackupScreen restoreStatus={restoreStatus} />
    </RestoreNavScreen>
  );
}
