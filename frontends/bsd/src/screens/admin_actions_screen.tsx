import { ElectionDefinition, MarkThresholds } from '@votingworks/types';
import React, { useCallback, useEffect, useState, useContext } from 'react';
import { LogEventId } from '@votingworks/logging';
import { LogFileType } from '@votingworks/utils';
import { Loading, Modal, SetClockButton } from '@votingworks/ui';
import { Button } from '../components/button';
import { LinkButton } from '../components/link_button';
import { Main, MainChild } from '../components/main';
import { MainNav } from '../components/main_nav';
import { Prose } from '../components/prose';
import { Text } from '../components/text';
import { Screen } from '../components/screen';
import { ToggleTestModeButton } from '../components/toggle_test_mode_button';
import { SetMarkThresholdsModal } from '../components/set_mark_thresholds_modal';
import { AppContext } from '../contexts/app_context';
import { ExportLogsModal } from '../components/export_logs_modal';

interface Props {
  unconfigureServer: () => Promise<void>;
  zeroData: () => Promise<void>;
  backup: () => Promise<void>;
  hasBatches: boolean;
  isTestMode: boolean;
  isTogglingTestMode: boolean;
  canUnconfigure: boolean;
  toggleTestMode: () => Promise<void>;
  setMarkThresholdOverrides: (markThresholds?: MarkThresholds) => Promise<void>;
  markThresholds?: MarkThresholds;
  electionDefinition: ElectionDefinition;
}

export function AdminActionsScreen({
  unconfigureServer,
  zeroData,
  backup,
  hasBatches,
  isTestMode,
  isTogglingTestMode,
  toggleTestMode,
  canUnconfigure,
  setMarkThresholdOverrides,
  markThresholds,
  electionDefinition,
}: Props): JSX.Element {
  const { lockMachine, logger, currentUserSession } = useContext(AppContext);
  const currentUserType = currentUserSession?.type ?? 'unknown';
  const [isConfirmingUnconfigure, setIsConfirmingUnconfigure] = useState(false);
  const [
    isDoubleConfirmingUnconfigure,
    setIsDoubleConfirmingUnconfigure,
  ] = useState(false);
  const [isFactoryResetting, setIsFactoryResetting] = useState(false);
  const [isDeletingBallotData, setIsDeletingBallotData] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupError, setBackupError] = useState('');
  function toggleIsConfirmingUnconfigure() {
    setIsConfirmingUnconfigure((s) => !s);
  }
  function toggleIsDoubleConfirmingUnconfigure() {
    setIsDoubleConfirmingUnconfigure((s) => !s);
  }
  const [isConfirmingZero, setIsConfirmingZero] = useState(false);
  const [exportingLogType, setExportingLogType] = useState<LogFileType>();
  const [isSetMarkThresholdModalOpen, setIsMarkThresholdModalOpen] = useState(
    false
  );
  function toggleIsConfirmingZero() {
    return setIsConfirmingZero((s) => !s);
  }
  const exportBackup = useCallback(async () => {
    try {
      setBackupError('');
      setIsBackingUp(true);
      await backup();
      await logger.log(LogEventId.DownloadedScanImageBackup, currentUserType, {
        disposition: 'success',
        message: 'User successfully downloaded ballot data backup files.',
      });
    } catch (error) {
      setBackupError(error.toString());
      await logger.log(LogEventId.DownloadedScanImageBackup, currentUserType, {
        disposition: 'failure',
        message: `Error downloading ballot data backup: ${error.message}`,
        result: 'No backup downloaded.',
      });
    } finally {
      setIsBackingUp(false);
    }
  }, [backup, logger, currentUserType]);

  const deleteBallotData = useCallback(async () => {
    toggleIsConfirmingZero();
    setIsDeletingBallotData(true);
    await zeroData();
    setIsDeletingBallotData(false);
  }, [zeroData]);

  useEffect(() => {
    if (isFactoryResetting) {
      let isMounted = true;
      void (async () => {
        await unconfigureServer();
        if (isMounted) {
          setIsFactoryResetting(false);
        }
      })();
      return () => {
        isMounted = false;
      };
    }
  }, [isFactoryResetting, unconfigureServer]);

  return (
    <React.Fragment>
      <Screen>
        <Main>
          <MainChild>
            <Prose>
              <h1>Admin Actions</h1>
              <p>
                <ToggleTestModeButton
                  isTestMode={isTestMode}
                  isTogglingTestMode={isTogglingTestMode}
                  toggleTestMode={toggleTestMode}
                  canUnconfigure={canUnconfigure}
                />
              </p>
              <p>
                <Button
                  onPress={() => setIsMarkThresholdModalOpen(true)}
                  disabled={hasBatches}
                >
                  {markThresholds === undefined
                    ? 'Override Mark Thresholds…'
                    : 'Reset Mark Thresholds…'}
                </Button>
              </p>
              {backupError && <p style={{ color: 'red' }}>{backupError}</p>}
              <p>
                <Button onPress={exportBackup} disabled={isBackingUp}>
                  {isBackingUp ? 'Exporting…' : 'Export Backup…'}
                </Button>
              </p>
              <p>
                <Button onPress={() => setExportingLogType(LogFileType.Raw)}>
                  Export Logs…
                </Button>{' '}
                <Button onPress={() => setExportingLogType(LogFileType.Cdf)}>
                  Export Logs as CDF…
                </Button>
              </p>
              <p>
                <SetClockButton>Update Date and Time…</SetClockButton>
              </p>
              <p>
                <Button
                  danger
                  disabled={!hasBatches || (!isTestMode && !canUnconfigure)}
                  onPress={toggleIsConfirmingZero}
                >
                  Delete Ballot Data…
                </Button>
              </p>

              <p>
                <Button
                  danger
                  disabled={!canUnconfigure && !isTestMode}
                  onPress={toggleIsConfirmingUnconfigure}
                >
                  Delete Election Data from VxCentralScan…
                </Button>{' '}
                {!canUnconfigure && !isTestMode && (
                  <React.Fragment>
                    <br />
                    <Text as="span" warning warningIcon>
                      You must &quot;Export Backup&quot; before you may delete
                      election data.
                    </Text>
                  </React.Fragment>
                )}
              </p>
            </Prose>
          </MainChild>
        </Main>
        <MainNav isTestMode={isTestMode}>
          <Button small onPress={lockMachine}>
            Lock Machine
          </Button>
          <LinkButton small to="/">
            Back to Dashboard
          </LinkButton>
        </MainNav>
      </Screen>
      {isConfirmingZero && (
        <Modal
          centerContent
          content={
            <Prose textCenter>
              <h1>Delete All Scanned Ballot Data?</h1>
              <p>
                This will permanently delete all scanned ballot data and reset
                the scanner to only be configured with the current election,
                with the default mark thresholds.
              </p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button onPress={toggleIsConfirmingZero}>Cancel</Button>
              <Button danger onPress={deleteBallotData}>
                Yes, Delete Ballot Data
              </Button>
            </React.Fragment>
          }
          onOverlayClick={toggleIsConfirmingZero}
        />
      )}
      {isConfirmingUnconfigure && (
        <Modal
          centerContent
          content={
            <Prose textCenter>
              <h1>Delete all election data?</h1>
              <p>
                This will delete the election configuration and all the scanned
                ballot data from VxCentralScan.
              </p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button
                danger
                onPress={() => {
                  toggleIsConfirmingUnconfigure();
                  setIsDoubleConfirmingUnconfigure(true);
                }}
              >
                Yes, Delete Election Data
              </Button>
              <Button onPress={toggleIsConfirmingUnconfigure}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={toggleIsConfirmingUnconfigure}
        />
      )}
      {isDoubleConfirmingUnconfigure && (
        <Modal
          centerContent
          content={
            <Prose textCenter>
              <h1>Are you sure?</h1>
              <p>This can not be undone.</p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button
                danger
                onPress={() => {
                  toggleIsDoubleConfirmingUnconfigure();
                  setIsFactoryResetting(true);
                }}
              >
                I am sure. Delete all election data.
              </Button>
              <Button onPress={toggleIsDoubleConfirmingUnconfigure}>
                Cancel
              </Button>
            </React.Fragment>
          }
          onOverlayClick={toggleIsDoubleConfirmingUnconfigure}
        />
      )}
      {isFactoryResetting && (
        <Modal
          centerContent
          content={<Loading>Deleting election data</Loading>}
        />
      )}
      {isDeletingBallotData && (
        <Modal
          centerContent
          content={<Loading>Deleting ballot data</Loading>}
        />
      )}
      {isSetMarkThresholdModalOpen && (
        <SetMarkThresholdsModal
          setMarkThresholdOverrides={setMarkThresholdOverrides}
          markThresholds={electionDefinition.election.markThresholds}
          markThresholdOverrides={markThresholds}
          onClose={() => setIsMarkThresholdModalOpen(false)}
        />
      )}
      {exportingLogType !== undefined && (
        <ExportLogsModal
          onClose={() => setExportingLogType(undefined)}
          logFileType={exportingLogType}
        />
      )}
    </React.Fragment>
  );
}
