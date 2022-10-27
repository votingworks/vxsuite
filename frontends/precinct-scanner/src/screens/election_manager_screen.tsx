import {
  MarkThresholds,
  SelectChangeEventFunction,
  ok,
  PrecinctSelection,
  PollsState,
} from '@votingworks/types';
import {
  Button,
  CurrentDateAndTime,
  Loading,
  Modal,
  Prose,
  SegmentedButton,
  Select,
  SetClockButton,
  UsbDrive,
  isElectionManagerAuth,
} from '@votingworks/ui';
import {
  ALL_PRECINCTS_NAME,
  ALL_PRECINCTS_SELECTION,
  assert,
  singlePrecinctSelectionFor,
  usbstick,
} from '@votingworks/utils';
import React, { useCallback, useContext, useState } from 'react';
import { Scan } from '@votingworks/api';
import { CalibrateScannerModal } from '../components/calibrate_scanner_modal';
import { ExportBackupModal } from '../components/export_backup_modal';
import { ExportResultsModal } from '../components/export_results_modal';
import { ScannedBallotCount } from '../components/scanned_ballot_count';
import { ScreenMainCenterChild } from '../components/layout';
import { AppContext } from '../contexts/app_context';
import { SetMarkThresholdsModal } from '../components/set_mark_thresholds_modal';
import {
  ALL_PRECINCTS_OPTION_VALUE,
  ChangePrecinctButton,
} from '../components/change_precinct_button';

export const SELECT_PRECINCT_TEXT = 'Select a precinct for this device…';

export interface ElectionManagerScreenProps {
  scannerStatus: Scan.PrecinctScannerStatus;
  isTestMode: boolean;
  pollsState: PollsState;
  updatePrecinctSelection(precinctSelection: PrecinctSelection): Promise<void>;
  setMarkThresholdOverrides: (markThresholds?: MarkThresholds) => Promise<void>;
  toggleLiveMode(): Promise<void>;
  toggleIsSoundMuted(): void;
  unconfigure(): Promise<void>;
  usbDrive: UsbDrive;
}

export function ElectionManagerScreen({
  scannerStatus,
  isTestMode,
  pollsState,
  updatePrecinctSelection,
  toggleLiveMode,
  toggleIsSoundMuted,
  setMarkThresholdOverrides,
  unconfigure,
  usbDrive,
}: ElectionManagerScreenProps): JSX.Element {
  const {
    electionDefinition,
    precinctSelection,
    currentMarkThresholds,
    auth,
    isSoundMuted,
  } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;
  assert(isElectionManagerAuth(auth));
  const userRole = auth.user.role;

  const [isLoading, setIsLoading] = useState(false);

  const [
    isShowingToggleLiveModeWarningModal,
    setIsShowingToggleLiveModeWarningModal,
  ] = useState(false);
  const openToggleLiveModeWarningModal = useCallback(
    () => setIsShowingToggleLiveModeWarningModal(true),
    []
  );
  const closeToggleLiveModeWarningModal = useCallback(
    () => setIsShowingToggleLiveModeWarningModal(false),
    []
  );

  const [isExportingResults, setIsExportingResults] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);

  const [confirmUnconfigure, setConfirmUnconfigure] = useState(false);
  const openConfirmUnconfigureModal = useCallback(
    () => setConfirmUnconfigure(true),
    []
  );
  const closeConfirmUnconfigureModal = useCallback(
    () => setConfirmUnconfigure(false),
    []
  );
  const [isCalibratingScanner, setIsCalibratingScanner] = useState(false);
  const openCalibrateScannerModal = useCallback(
    () => setIsCalibratingScanner(true),
    []
  );
  const closeCalibrateScannerModal = useCallback(
    () => setIsCalibratingScanner(false),
    []
  );

  const [isMarkThresholdModalOpen, setIsMarkThresholdModalOpen] =
    useState(false);

  const handlePrecinctSelectionChange: SelectChangeEventFunction = async (
    event
  ) => {
    const { value } = event.currentTarget;
    const newPrecinctSelection =
      value === ALL_PRECINCTS_OPTION_VALUE
        ? ALL_PRECINCTS_SELECTION
        : singlePrecinctSelectionFor(value);

    await updatePrecinctSelection(newPrecinctSelection);
  };

  async function handleTogglingLiveMode() {
    if (!isTestMode && !scannerStatus.canUnconfigure) {
      openToggleLiveModeWarningModal();
    } else {
      setIsLoading(true);
      await toggleLiveMode();
      setIsLoading(false);
    }
  }

  async function handleUnconfigure() {
    setIsLoading(true);
    // If there is a mounted usb eject it so that it doesn't auto reconfigure the machine.
    if (usbDrive.status === usbstick.UsbDriveStatus.mounted) {
      await usbDrive.eject(userRole);
    }
    await unconfigure();
  }

  const precinctSelectionValue = precinctSelection
    ? precinctSelection.kind === 'AllPrecincts'
      ? ALL_PRECINCTS_OPTION_VALUE
      : precinctSelection.precinctId
    : '';

  return (
    <ScreenMainCenterChild infoBarMode="admin">
      <Prose textCenter>
        <h1>Election Manager Settings</h1>
        {pollsState === 'polls_closed_initial' ? (
          <p>
            <Select
              id="selectPrecinct"
              data-testid="selectPrecinct"
              value={precinctSelectionValue}
              onBlur={handlePrecinctSelectionChange}
              onChange={handlePrecinctSelectionChange}
              disabled={scannerStatus.ballotsCounted > 0}
              large
            >
              <option value="" disabled>
                {SELECT_PRECINCT_TEXT}
              </option>
              {election.precincts.length > 1 && (
                <option value={ALL_PRECINCTS_OPTION_VALUE}>
                  {ALL_PRECINCTS_NAME}
                </option>
              )}
              {[...election.precincts]
                .sort((a, b) =>
                  a.name.localeCompare(b.name, undefined, {
                    ignorePunctuation: true,
                  })
                )
                .map((precinct) => (
                  <option key={precinct.id} value={precinct.id}>
                    {precinct.name}
                  </option>
                ))}
            </Select>
          </p>
        ) : (
          precinctSelection && (
            <p>
              <ChangePrecinctButton
                initialPrecinctSelection={precinctSelection}
                updatePrecinctSelection={updatePrecinctSelection}
                election={election}
                disabled={
                  scannerStatus.ballotsCounted > 0 ||
                  pollsState === 'polls_closed_final'
                }
              />
            </p>
          )
        )}
        <p>
          <SegmentedButton>
            <Button
              large
              onPress={handleTogglingLiveMode}
              disabled={isTestMode}
            >
              Testing Mode
            </Button>
            <Button
              large
              onPress={handleTogglingLiveMode}
              disabled={!isTestMode}
            >
              Live Election Mode
            </Button>
          </SegmentedButton>
        </p>
        <p>
          <SetClockButton large>
            <span role="img" aria-label="Clock">
              🕓
            </span>{' '}
            <CurrentDateAndTime />
          </SetClockButton>
        </p>
        <p>
          <Button onPress={() => setIsExportingResults(true)}>Save CVRs</Button>{' '}
          <Button onPress={() => setIsExportingBackup(true)}>
            Save Backup
          </Button>
        </p>
        <p>
          <Button onPress={() => setIsMarkThresholdModalOpen(true)}>
            {currentMarkThresholds === undefined
              ? 'Override Mark Thresholds'
              : 'Reset Mark Thresholds'}
          </Button>
        </p>
        <p>
          <Button onPress={openCalibrateScannerModal}>Calibrate Scanner</Button>
        </p>
        <p>
          <Button onPress={toggleIsSoundMuted}>
            {isSoundMuted ? 'Unmute Sounds' : 'Mute Sounds'}
          </Button>
        </p>
        <p>
          <Button
            disabled={!scannerStatus.canUnconfigure}
            danger
            small
            onPress={openConfirmUnconfigureModal}
          >
            <span role="img" aria-label="Warning">
              ⚠️
            </span>{' '}
            Delete All Election Data from VxScan
          </Button>
        </p>
        {!scannerStatus.canUnconfigure && (
          <p>
            You must “Save Backup” before you can delete election data from
            VxScan.
          </p>
        )}
      </Prose>
      <ScannedBallotCount count={scannerStatus.ballotsCounted} />
      {isMarkThresholdModalOpen && (
        <SetMarkThresholdsModal
          setMarkThresholdOverrides={setMarkThresholdOverrides}
          markThresholds={electionDefinition.election.markThresholds}
          markThresholdOverrides={currentMarkThresholds}
          onClose={() => setIsMarkThresholdModalOpen(false)}
        />
      )}
      {isShowingToggleLiveModeWarningModal && (
        <Modal
          content={
            <Prose>
              <h1>Save Backup to switch to Test Mode</h1>
              <p>
                You must &quot;Save Backup&quot; before you may switch to
                Testing Mode.
              </p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button
                primary
                onPress={() => {
                  closeToggleLiveModeWarningModal();
                  setIsExportingBackup(true);
                }}
              >
                Save Backup
              </Button>
              <Button onPress={closeToggleLiveModeWarningModal}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={closeToggleLiveModeWarningModal}
        />
      )}
      {confirmUnconfigure && (
        <Modal
          content={
            <Prose>
              <h1>Delete All Election Data?</h1>
              <p>
                Do you want to remove all election information and data from
                this machine?
              </p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button danger onPress={handleUnconfigure}>
                Yes, Delete All
              </Button>
              <Button onPress={closeConfirmUnconfigureModal}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={closeConfirmUnconfigureModal}
        />
      )}
      {isCalibratingScanner && (
        <CalibrateScannerModal
          scannerStatus={scannerStatus}
          onCancel={closeCalibrateScannerModal}
        />
      )}
      {isLoading && <Modal content={<Loading />} />}
      {isExportingResults && (
        <ExportResultsModal
          onClose={() => setIsExportingResults(false)}
          usbDrive={usbDrive}
          isTestMode={isTestMode}
          scannedBallotCount={scannerStatus.ballotsCounted}
        />
      )}
      {isExportingBackup && (
        <ExportBackupModal
          onClose={() => setIsExportingBackup(false)}
          usbDrive={usbDrive}
        />
      )}
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  const { machineConfig, electionDefinition } = useContext(AppContext);
  const [isTestMode, setIsTestMode] = useState(false);
  const [isSoundMuted, setIsSoundMuted] = useState(false);
  const [precinctSelection, setPrecinctSelection] =
    useState<PrecinctSelection>();
  assert(electionDefinition);
  return (
    <AppContext.Provider
      value={{
        machineConfig,
        electionDefinition,
        precinctSelection,
        currentMarkThresholds: undefined,
        isSoundMuted,
        auth: {
          status: 'logged_in',
          user: {
            role: 'election_manager',
            electionHash: electionDefinition.electionHash,
            passcode: '000000',
          },
          card: {
            hasStoredData: false,
            readStoredObject: () => Promise.resolve(ok(undefined)),
            readStoredString: () => Promise.resolve(ok(undefined)),
            readStoredUint8Array: () => Promise.resolve(ok(new Uint8Array())),
            writeStoredData: () => Promise.resolve(ok()),
            clearStoredData: () => Promise.resolve(ok()),
          },
        },
      }}
    >
      <ElectionManagerScreen
        scannerStatus={{
          state: 'no_paper',
          ballotsCounted: 1234,
          canUnconfigure: true,
        }}
        isTestMode={isTestMode}
        pollsState="polls_closed_initial"
        // eslint-disable-next-line @typescript-eslint/require-await
        toggleLiveMode={async () => setIsTestMode((prev) => !prev)}
        toggleIsSoundMuted={() => setIsSoundMuted((prev) => !prev)}
        unconfigure={() => Promise.resolve()}
        setMarkThresholdOverrides={() => Promise.resolve()}
        // eslint-disable-next-line @typescript-eslint/require-await
        updatePrecinctSelection={async (newPrecinctSelection) =>
          setPrecinctSelection(newPrecinctSelection)
        }
        usbDrive={{
          status: usbstick.UsbDriveStatus.notavailable,
          eject: () => Promise.resolve(),
        }}
      />
    </AppContext.Provider>
  );
}
