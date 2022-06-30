import {
  Precinct,
  PrecinctId,
  SelectChangeEventFunction,
  ok,
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
  Bar,
  isAdminAuth,
} from '@votingworks/ui';
import { assert, format, usbstick } from '@votingworks/utils';
import React, { useCallback, useContext, useState } from 'react';
import { Absolute } from '../components/absolute';
import { CalibrateScannerModal } from '../components/calibrate_scanner_modal';
import { ExportBackupModal } from '../components/export_backup_modal';
import { ExportResultsModal } from '../components/export_results_modal';
import { ScreenMainCenterChild } from '../components/layout';
import { AppContext } from '../contexts/app_context';

interface Props {
  scannedBallotCount: number;
  isTestMode: boolean;
  updateAppPrecinctId(appPrecinctId: PrecinctId): Promise<void>;
  toggleLiveMode(): Promise<void>;
  unconfigure(): Promise<void>;
  calibrate(): Promise<boolean>;
  usbDrive: UsbDrive;
}

export function AdminScreen({
  scannedBallotCount,
  isTestMode,
  updateAppPrecinctId,
  toggleLiveMode,
  unconfigure,
  calibrate,
  usbDrive,
}: Props): JSX.Element {
  const { electionDefinition, currentPrecinctId, auth } =
    useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;
  assert(isAdminAuth(auth));
  const userRole = auth.user.role;

  const [isLoading, setIsLoading] = useState(false);
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

  const changeAppPrecinctId: SelectChangeEventFunction = async (event) => {
    await updateAppPrecinctId(event.currentTarget.value);
  };

  async function handleTogglingLiveMode() {
    setIsLoading(true);
    await toggleLiveMode();
    setIsLoading(false);
  }

  async function handleUnconfigure() {
    setIsLoading(true);
    // If there is a mounted usb eject it so that it doesn't auto reconfigure the machine.
    if (usbDrive.status === usbstick.UsbDriveStatus.mounted) {
      await usbDrive.eject(userRole);
    }
    await unconfigure();
  }

  return (
    <ScreenMainCenterChild infoBarMode="admin">
      <Prose textCenter>
        <h1>Administrator Settings</h1>
        <p>
          <Select
            id="selectPrecinct"
            data-testid="selectPrecinct"
            value={currentPrecinctId}
            onBlur={changeAppPrecinctId}
            onChange={changeAppPrecinctId}
            large
          >
            <option value="">All Precincts</option>
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
          <Button onPress={() => setIsExportingResults(true)}>
            Export Results to USB Drive
          </Button>
        </p>
        <p>
          <Button onPress={() => setIsExportingBackup(true)}>
            Export Backup to USB Drive
          </Button>
        </p>
        <p>
          <Button onPress={openCalibrateScannerModal}>Calibrate Scanner</Button>
        </p>
        <p>
          <Button danger small onPress={openConfirmUnconfigureModal}>
            <span role="img" aria-label="Warning">
              ⚠️
            </span>{' '}
            Unconfigure Machine
          </Button>
        </p>
      </Prose>
      <Absolute top left>
        <Bar>
          <div>
            Ballots Scanned:{' '}
            <strong data-testid="ballot-count">
              {format.count(scannedBallotCount)}
            </strong>{' '}
          </div>
        </Bar>
      </Absolute>
      {confirmUnconfigure && (
        <Modal
          content={
            <Prose>
              <h1>Unconfigure Machine?</h1>
              <p>
                Do you want to remove all election information and data from
                this machine?
              </p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button danger onPress={handleUnconfigure}>
                Unconfigure
              </Button>
              <Button onPress={closeConfirmUnconfigureModal}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={closeConfirmUnconfigureModal}
        />
      )}
      {isCalibratingScanner && (
        <CalibrateScannerModal
          onCalibrate={calibrate}
          onCancel={closeCalibrateScannerModal}
        />
      )}
      {isLoading && <Modal content={<Loading />} />}
      {isExportingResults && (
        <ExportResultsModal
          onClose={() => setIsExportingResults(false)}
          usbDrive={usbDrive}
          isTestMode={isTestMode}
          scannedBallotCount={scannedBallotCount}
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
  const [precinctId, setPrecinctId] = useState<Precinct['id']>();
  assert(electionDefinition);
  return (
    <AppContext.Provider
      value={{
        machineConfig,
        electionDefinition,
        currentPrecinctId: precinctId,
        auth: {
          status: 'logged_in',
          user: {
            role: 'admin',
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
      <AdminScreen
        calibrate={() => Promise.resolve(true)}
        isTestMode={isTestMode}
        // eslint-disable-next-line @typescript-eslint/require-await
        toggleLiveMode={async () => setIsTestMode((prev) => !prev)}
        scannedBallotCount={1234}
        unconfigure={() => Promise.resolve()}
        // eslint-disable-next-line @typescript-eslint/require-await
        updateAppPrecinctId={async (newPrecinctId) =>
          setPrecinctId(newPrecinctId)
        }
        usbDrive={{
          status: usbstick.UsbDriveStatus.notavailable,
          eject: () => Promise.resolve(),
        }}
      />
    </AppContext.Provider>
  );
}
