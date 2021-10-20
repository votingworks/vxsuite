import { Precinct, SelectChangeEventFunction } from '@votingworks/types';
import {
  Button,
  Loading,
  Prose,
  SegmentedButton,
  Select,
  UsbDrive,
  useNow,
} from '@votingworks/ui';
import { format, formatFullDateTimeZone, usbstick } from '@votingworks/utils';
import { strict as assert } from 'assert';
import { DateTime } from 'luxon';
import React, { useCallback, useContext, useState } from 'react';
import { Absolute } from '../components/Absolute';
import { Bar } from '../components/Bar';
import CalibrateScannerModal from '../components/CalibrateScannerModal';
import ExportBackupModal from '../components/ExportBackupModal';
import ExportResultsModal from '../components/ExportResultsModal';
import { CenteredScreen } from '../components/Layout';
import Modal from '../components/Modal';
import PickDateTimeModal from '../components/PickDateTimeModal';
import AppContext from '../contexts/AppContext';

interface Props {
  scannedBallotCount: number;
  isTestMode: boolean;
  updateAppPrecinctId(appPrecinctId: string): Promise<void>;
  toggleLiveMode(): Promise<void>;
  unconfigure(): Promise<void>;
  calibrate(): Promise<boolean>;
  usbDrive: UsbDrive;
}

function AdminScreen({
  scannedBallotCount,
  isTestMode,
  updateAppPrecinctId,
  toggleLiveMode,
  unconfigure,
  calibrate,
  usbDrive,
}: Props): JSX.Element {
  const { electionDefinition, currentPrecinctId } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;

  const systemDate = useNow();
  const [isSystemDateModalActive, setIsSystemDateModalActive] = useState(false);
  const [isSettingClock, setIsSettingClock] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isExportingResults, setIsExportingResults] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);

  const setClock = useCallback(
    async (date: DateTime) => {
      setIsSettingClock(true);
      try {
        await window.kiosk?.setClock({
          isoDatetime: date.toISO(),
          IANAZone: date.zoneName,
        });
        setIsSystemDateModalActive(false);
      } finally {
        setIsSettingClock(false);
      }
    },
    [setIsSettingClock, setIsSystemDateModalActive]
  );

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
    await unconfigure();
  }

  return (
    <CenteredScreen infoBarMode="admin">
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
          <Button large onPress={() => setIsSystemDateModalActive(true)}>
            <span role="img" aria-label="Clock">
              🕓
            </span>{' '}
            {formatFullDateTimeZone(systemDate, { includeTimezone: true })}
          </Button>
        </p>
        <p>
          <Button onPress={() => setIsExportingResults(true)}>
            Export Results to USB
          </Button>
        </p>
        <p>
          <Button onPress={() => setIsExportingBackup(true)}>
            Export Backup to USB
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
      {isSystemDateModalActive && (
        <PickDateTimeModal
          disabled={isSettingClock}
          onCancel={() => setIsSystemDateModalActive(false)}
          onSave={setClock}
          saveLabel={isSettingClock ? 'Saving…' : 'Save'}
          value={systemDate}
        />
      )}
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
    </CenteredScreen>
  );
}

export default AdminScreen;

/* istanbul ignore next */
export const DefaultPreview: React.FC =
  process.env.NODE_ENV === 'development'
    ? () => {
        const { machineConfig, electionDefinition } = useContext(AppContext);
        const [isTestMode, setIsTestMode] = useState(false);
        const [precinctId, setPrecinctId] = useState<Precinct['id']>();
        return (
          <AppContext.Provider
            value={{
              machineConfig,
              electionDefinition,
              currentPrecinctId: precinctId,
            }}
          >
            <AdminScreen
              calibrate={() => Promise.resolve(true)}
              isTestMode={isTestMode}
              toggleLiveMode={async () => setIsTestMode((prev) => !prev)}
              scannedBallotCount={1234}
              unconfigure={() => Promise.resolve()}
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
    : () => null;
