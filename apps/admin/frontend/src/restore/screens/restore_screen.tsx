import styled, { keyframes } from 'styled-components';
import type {
  MachineConfig,
  ProgressEvent,
  RestoreStatus,
} from '@votingworks/admin-backend';
import {
  Button,
  Callout,
  H1,
  H2,
  InfoBar,
  Main,
  P,
  ProgressBar,
  Screen,
  SystemInfo,
  useSystemCallApi,
} from '@votingworks/ui';
import {
  cancelRestore,
  getRestoreStatus,
  getUsbDriveStatus,
  listAvailableBackups,
  logOut,
  restoreBackup,
} from '../api.js';

const slide = keyframes`
  from {
    transform: translateX(-100%);
  }

  to {
    transform: translateX(300%);
  }
`;

const IndeterminateTrack = styled.div`
  background-color: ${(p) => p.theme.colors.containerLow};
  border: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  height: 0.75rem;
  width: 100%;
  overflow: hidden;
`;

const IndeterminateFill = styled.div`
  background-color: ${(p) => p.theme.colors.primary};
  height: 100%;
  width: 33%;
  animation: ${slide} 1.2s linear infinite;
`;

/**
 * A progress bar for work whose extent is not known: it moves, so the operator
 * can tell the machine is not stuck, without claiming how far along it is.
 */
function IndeterminateProgressBar(): JSX.Element {
  return (
    <IndeterminateTrack role="progressbar" aria-label="In progress">
      <IndeterminateFill />
    </IndeterminateTrack>
  );
}

const Section = styled.div`
  max-width: 40rem;
  margin-bottom: 1.5rem;
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

/**
 * What to show for the restore's latest progress event: a phase name, and how
 * far along it is when the phase can say.
 */
function describeProgress(progress?: ProgressEvent): {
  label: string;
  fraction?: number;
} {
  switch (progress?.type) {
    case undefined:
    case 'preparing': {
      return { label: 'Preparing to restore' };
    }

    case 'copy_files': {
      return {
        label: `Copying files (${progress.copiedCount} of ${progress.totalCount})`,
        fraction:
          progress.totalBytes > 0
            ? Math.min(1, progress.copiedBytes / progress.totalBytes)
            : undefined,
      };
    }

    case 'verifying': {
      return { label: 'Verifying restored files' };
    }

    case 'flushing_workspace': {
      return { label: 'Writing restored files to disk' };
    }

    // The remaining events belong to creating a backup, which a restore never
    // reports.
    default: {
      return { label: 'Restoring' };
    }
  }
}

function RestoreProgress({
  status,
}: {
  status: Extract<RestoreStatus, { state: 'restoring' }>;
}): JSX.Element {
  const cancelRestoreMutation = cancelRestore.useMutation();
  const { label, fraction } = describeProgress(status.progress);
  return (
    <Section>
      <H2>Restoring…</H2>
      <P>{label}</P>
      {fraction === undefined ? (
        <IndeterminateProgressBar />
      ) : (
        <ProgressBar progress={fraction} />
      )}
      <P>
        <Button
          onPress={() => cancelRestoreMutation.mutate()}
          disabled={cancelRestoreMutation.isLoading}
        >
          Cancel Restore
        </Button>
      </P>
    </Section>
  );
}

function RestoreOutcome({
  status,
}: {
  status: Extract<RestoreStatus, { state: 'restored' | 'failed' }>;
}): JSX.Element {
  if (status.state === 'restored') {
    return (
      <Section>
        <Callout icon="Done" color="primary">
          Backup restored. Restart VxAdmin to use it.
        </Callout>
      </Section>
    );
  }

  return (
    <Section>
      <Callout icon="Danger" color="danger">
        {status.error.type === 'cancelled'
          ? 'Restore cancelled.'
          : `Restore failed: ${status.error.message}`}
      </Callout>
    </Section>
  );
}

function AvailableBackups(): JSX.Element | null {
  const usbDriveStatusQuery = getUsbDriveStatus.usePollingQuery();
  const backupsQuery = listAvailableBackups.usePollingQuery();
  const restoreBackupMutation = restoreBackup.useMutation();

  if (!usbDriveStatusQuery.isSuccess || !backupsQuery.isSuccess) {
    return null;
  }

  if (usbDriveStatusQuery.data.status !== 'mounted') {
    return (
      <Section>
        <P>Insert a USB drive containing a VxAdmin backup.</P>
      </Section>
    );
  }

  const backupsResult = backupsQuery.data;
  if (backupsResult.isErr()) {
    return (
      <Section>
        <Callout icon="Warning" color="warning">
          Could not read backups from the USB drive:{' '}
          {backupsResult.err().message}
        </Callout>
      </Section>
    );
  }

  const backups = backupsResult.ok();
  if (backups.length === 0) {
    return (
      <Section>
        <P>No backups were found on the USB drive.</P>
      </Section>
    );
  }

  return (
    <Section>
      <H2>Backups on USB Drive</H2>
      <P>Restoring replaces everything on this machine with the backup.</P>
      <ButtonRow>
        {backups.map((backup) => (
          <Button
            key={backup.path}
            variant="primary"
            icon="Import"
            onPress={() =>
              restoreBackupMutation.mutate({ backupPath: backup.path })
            }
            disabled={restoreBackupMutation.isLoading}
          >
            Restore {backup.name}
          </Button>
        ))}
      </ButtonRow>
    </Section>
  );
}

export function RestoreScreen({
  machineConfig,
}: {
  machineConfig: MachineConfig;
}): JSX.Element | null {
  const restoreStatusQuery = getRestoreStatus.usePollingQuery();
  const rebootMutation = useSystemCallApi().reboot.useMutation();
  const logOutMutation = logOut.useMutation();

  if (!restoreStatusQuery.isSuccess) {
    return null;
  }
  const status = restoreStatusQuery.data;

  return (
    <Screen>
      <Main padded>
        <H1>Restore Backup</H1>
        <Section>
          <P>
            VxAdmin is in restore mode. It is not serving election data until it
            restarts, with or without a restore.
          </P>
        </Section>
        {status.state === 'restoring' && <RestoreProgress status={status} />}
        {(status.state === 'restored' || status.state === 'failed') && (
          <RestoreOutcome status={status} />
        )}
        {status.state !== 'restoring' && status.state !== 'restored' && (
          <AvailableBackups />
        )}
        <ButtonRow>
          <Button
            variant={status.state === 'restored' ? 'primary' : undefined}
            onPress={() => rebootMutation.mutate()}
            disabled={status.state === 'restoring' || rebootMutation.isLoading}
          >
            Restart
          </Button>
          <Button onPress={() => logOutMutation.mutate()}>Lock Machine</Button>
        </ButtonRow>
      </Main>
      <InfoBar>
        <SystemInfo
          mode="admin"
          codeVersion={machineConfig.codeVersion}
          machineId={machineConfig.machineId}
        />
      </InfoBar>
    </Screen>
  );
}
