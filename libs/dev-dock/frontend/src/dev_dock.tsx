import React, { RefObject, useEffect, useRef, useState } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import styled, { css, FlattenSimpleInterpolation } from 'styled-components';
import * as grout from '@votingworks/grout';
import {
  assert,
  assertDefined,
  extractErrorMessage,
  sleep,
  uniqueBy,
} from '@votingworks/basics';
import type {
  Api,
  DevDockSide,
  DevDockUserRole,
} from '@votingworks/dev-dock-backend';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowDown,
  faArrowLeft,
  faArrowRight,
  faArrowUp,
  faCamera,
  faCaretDown,
  faCaretLeft,
  faCaretRight,
  faCaretUp,
  faCircleDown,
  faGamepad,
  faGear,
  faGift,
  faPrint,
  faQrcode,
  faXmark,
  IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
import {
  isFeatureFlagEnabled,
  BooleanEnvironmentVariableName,
} from '@votingworks/utils';
import { Button, Modal, P, VxThemeProvider } from '@votingworks/ui';
import { UsbDriveIcon } from './usb_drive_icon.js';
import { Colors } from './colors.js';
import { FujitsuPrinterMockControl } from './fujitsu_printer_mock.js';
import { ApiClient, ApiClientContext, useApiClient } from './api_client.js';

const Row = styled.div`
  display: flex;
  flex-direction: row;
  gap: 15px;
`;

const Column = styled.div`
  display: flex;
  flex-direction: column;
  gap: 15px;
`;

const IconsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 80px);
  grid-auto-rows: 80px;
  gap: 15px;
`;

const ElectionControlSelect = styled.select`
  /* Fill the remaining width of the flex parent (whose width is set by the
   * next row) without contributing to it. */
  width: 0;
  flex: 1;
  padding: 8px;
  border-radius: 4px;
  background-color: white;
  option {
    font-size: 14px;
    padding: 0;
  }
`;

const AVAILABLE_ELECTIONS_POLLING_INTERVAL_MS = 5000;

/**
 * The election selected in the dev dock
 */
function useElectionQuery() {
  const apiClient = useApiClient();
  return useQuery(
    ['getElection'],
    // @coverage-defer
    async () => (await apiClient.getElection()) ?? null
  );
}

function ElectionControl(): JSX.Element | null {
  const queryClient = useQueryClient();
  const apiClient = useApiClient();
  const getElectionQuery = useElectionQuery();
  // Polled so that a fresh VxDesign export shows up without reloading the app.
  const availableElectionsQuery = useQuery(
    ['getAvailableElections'],
    // @coverage-defer
    async () => (await apiClient.getAvailableElections()) ?? null,
    { refetchInterval: AVAILABLE_ELECTIONS_POLLING_INTERVAL_MS }
  );
  const availableElections = availableElectionsQuery.data || [];
  const setElectionMutation = useMutation(apiClient.setElection, {
    onSuccess: async () => await queryClient.invalidateQueries(['getElection']),
  });

  if (!getElectionQuery.isSuccess) return <ElectionControlSelect />;

  const selectedElection = getElectionQuery.data;

  async function onSelectElection(
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const inputPath = event.target.value;
    // @coverage-defer
    if (inputPath === 'Pick from file...') {
      const dialogResult = await assertDefined(window.kiosk).showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Election Files', extensions: ['json', 'zip'] },
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'ZIP Files', extensions: ['zip'] },
        ],
      });
      if (dialogResult.canceled) return;
      const selectedPath = dialogResult.filePaths[0];
      if (selectedPath) {
        setElectionMutation.mutate({ inputPath: selectedPath });
      }
    } else {
      setElectionMutation.mutate({ inputPath });
    }
  }

  const elections = uniqueBy(
    // @coverage-defer
    availableElections.concat(selectedElection ?? []),
    (election) => election.inputPath
  );

  return (
    <ElectionControlSelect
      value={selectedElection?.inputPath}
      onChange={onSelectElection}
    >
      {elections.map((election) => (
        <option key={election.inputPath} value={election.inputPath}>
          {election.title}
        </option>
      ))}
      {window.kiosk && <option>Pick from file...</option>}
    </ElectionControlSelect>
  );
}

const SmartCardButton = styled.button<{ isInserted: boolean }>`
  background-color: white;
  border: ${(props) =>
    props.isInserted
      ? `4px solid ${Colors.ACTIVE}`
      : `1px solid ${Colors.BORDER}`};
  color: ${(props) => (props.isInserted ? Colors.ACTIVE : Colors.TEXT)};
  border-radius: 8px;
  width: 115px;
  height: 175px;
  display: flex;
  flex-direction: column;
  align-items: center;
  p {
    font-weight: bold;
    font-size: 0.85em;
    margin-bottom: 40px;
  }
  &:disabled {
    color: ${Colors.DISABLED};
    border-color: ${Colors.DISABLED};
  }
`;

function SmartCardControl({
  role,
  isInserted,
  onClick,
  disabled,
}: {
  role: DevDockUserRole;
  isInserted: boolean;
  onClick(): void;
  disabled: boolean;
}): JSX.Element {
  const label = {
    poll_worker: 'Poll Worker',
    election_manager: 'Election Manager',
    system_administrator: 'System Admin',
    vendor: 'Vendor',
  }[role];
  return (
    <SmartCardButton
      onClick={onClick}
      isInserted={isInserted}
      disabled={disabled}
    >
      <p>{label}</p>
      {isInserted && <FontAwesomeIcon icon={faCircleDown} size="lg" />}
    </SmartCardButton>
  );
}

const SmartCardMocksDisabledMessage = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  > p {
    padding: 15px;
    background: #cccccc;
    text-align: center;
  }
`;

const ROLES = [
  'vendor',
  'system_administrator',
  'election_manager',
  'poll_worker',
] as const;

function SmartCardMockControls() {
  const queryClient = useQueryClient();
  const apiClient = useApiClient();
  const getCardStatusQuery = useQuery(
    ['getCardStatus'],
    // @coverage-defer
    async () => (await apiClient.getCardStatus()) ?? null
  );
  const insertCardMutation = useMutation(apiClient.insertCard, {
    onSuccess: async () =>
      await queryClient.invalidateQueries(['getCardStatus']),
  });
  const removeCardMutation = useMutation(apiClient.removeCard, {
    onSuccess: async () =>
      await queryClient.invalidateQueries(['getCardStatus']),
  });

  const cardStatus = getCardStatusQuery.data;
  const insertedCardRole =
    cardStatus?.status === 'ready'
      ? cardStatus.cardDetails.user?.role
      : undefined;

  function onCardClick(role: DevDockUserRole) {
    if (insertedCardRole === role) {
      removeCardMutation.mutate();
    } else {
      insertCardMutation.mutate({ role });
    }
  }

  const areSmartCardMocksEnabled = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.USE_MOCK_CARDS
  );

  return (
    <Row style={{ position: 'relative' }}>
      {!areSmartCardMocksEnabled && (
        <SmartCardMocksDisabledMessage>
          <p>
            Smart card mocks disabled
            <br />
            <code>USE_MOCK_CARDS=FALSE</code>
          </p>
        </SmartCardMocksDisabledMessage>
      )}
      {ROLES.map((role) => (
        <SmartCardControl
          key={role}
          isInserted={insertedCardRole === role}
          role={role}
          onClick={() => onCardClick(role)}
          disabled={
            !areSmartCardMocksEnabled ||
            !getCardStatusQuery.isSuccess ||
            (insertedCardRole !== undefined && insertedCardRole !== role)
          }
        />
      ))}
    </Row>
  );
}

const UsbDriveControl = styled.button<{ isInserted: boolean }>`
  position: relative;
  background-color: white;
  width: 80px;
  height: 120px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 5px;
  border: ${(props) =>
    props.isInserted
      ? `4px solid ${Colors.ACTIVE}`
      : `1px solid ${Colors.BORDER}`};
  &:disabled {
    color: ${Colors.DISABLED};
    border-color: ${Colors.DISABLED};
  }
`;

const UsbDriveClearButton = styled.button`
  background-color: white;
  border: 1px solid ${Colors.BORDER};
  border-radius: 4px;
  width: 100%;
  height: 40px;
  color: ${Colors.TEXT};
  &:active {
    color: ${Colors.ACTIVE};
    border-color: ${Colors.ACTIVE};
  }
  &:disabled {
    color: ${Colors.DISABLED};
    border-color: ${Colors.DISABLED};
  }
`;

const UsbMocksDisabledMessage = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  > p {
    padding: 5px;
    background: #cccccc;
    text-align: center;
    color: black;
    font-size: 13px;
  }
`;

const UsbDriveDevLabel = styled.div`
  font-size: 0.5em;
  text-align: center;
  color: ${Colors.TEXT};
`;

function UsbDriveMockControls() {
  const queryClient = useQueryClient();
  const apiClient = useApiClient();
  const getUsbDriveStatusQuery = useQuery(['getUsbDriveStatus'], () =>
    apiClient.getUsbDriveStatus()
  );
  const insertUsbDriveMutation = useMutation(apiClient.insertUsbDrive, {
    onSuccess: async () =>
      await queryClient.invalidateQueries(['getUsbDriveStatus']),
  });
  const removeUsbDriveMutation = useMutation(apiClient.removeUsbDrive, {
    onSuccess: async () =>
      await queryClient.invalidateQueries(['getUsbDriveStatus']),
  });
  const clearUsbDriveMutation = useMutation(apiClient.clearUsbDrive, {
    onSuccess: async () =>
      await queryClient.invalidateQueries(['getUsbDriveStatus']),
  });

  const [isUsbDriveRecentlyCleared, setIsUsbDriveRecentlyCleared] =
    useState(false);

  function handleClearClick() {
    clearUsbDriveMutation.mutate(undefined, {
      onSuccess: () => {
        setIsUsbDriveRecentlyCleared(true);
        setTimeout(() => {
          setIsUsbDriveRecentlyCleared(false);
        }, 1500);
      },
    });
  }

  const isFeatureEnabled = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.USE_MOCK_USB_DRIVE
  );
  const controlsDisabled =
    !isFeatureEnabled || !getUsbDriveStatusQuery.isSuccess;
  const drive = getUsbDriveStatusQuery.data;

  if (!drive) return null;

  const isInserted = drive.status === 'inserted';

  return (
    <React.Fragment>
      <div style={{ position: 'relative' }}>
        <UsbDriveControl
          onClick={() => {
            if (isInserted) {
              removeUsbDriveMutation.mutate();
            } else {
              insertUsbDriveMutation.mutate();
            }
          }}
          isInserted={isInserted}
          disabled={controlsDisabled}
          aria-label={`USB Drive ${drive.diskPath}`}
        >
          <UsbDriveIcon isInserted={isInserted} disabled={controlsDisabled} />
          {!isFeatureEnabled && (
            <UsbMocksDisabledMessage>
              <p>USB mock disabled</p>
            </UsbMocksDisabledMessage>
          )}
        </UsbDriveControl>
      </div>
      <UsbDriveDevLabel>{drive.diskPath}</UsbDriveDevLabel>
      <UsbDriveClearButton
        onClick={() => handleClearClick()}
        disabled={controlsDisabled}
      >
        {isUsbDriveRecentlyCleared ? '✓' : 'Clear'}
      </UsbDriveClearButton>
    </React.Fragment>
  );
}

const ScreenshotButton = styled.button`
  background-color: white;
  width: 80px;
  height: 80px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px solid ${Colors.BORDER};
  color: ${Colors.TEXT};

  &:active {
    color: ${Colors.ACTIVE};
    border-color: ${Colors.ACTIVE};
  }
  &:disabled {
    color: ${Colors.DISABLED};
    border-color: ${Colors.DISABLED};
  }
`;

interface ScreenshotToSaveProps {
  screenshot: Uint8Array<ArrayBufferLike>;
  fileName: string;
}

const ScreenshotModal = styled(Modal)`
  background-color: ${Colors.BACKGROUND};
  border-color: ${Colors.BORDER} !important;
  color: ${Colors.TEXT} !important;
`;

function ScreenshotControls({
  containerRef,
}: {
  containerRef: RefObject<HTMLDivElement>;
}) {
  const apiClient = useApiClient();
  const saveScreenshotForAppMutation = useMutation(
    apiClient.saveScreenshotForApp
  );

  const [screenshotToSave, setScreenshotToSave] =
    useState<ScreenshotToSaveProps>();

  async function captureScreenshot() {
    // Use a ref to the dock container to momentarily hide it during the
    // screenshot.
    assert(containerRef.current);
    // eslint-disable-next-line no-param-reassign
    containerRef.current.style.visibility = 'hidden';
    await sleep(500);

    assert(window.kiosk);
    const screenshot = await window.kiosk.captureScreenshot();

    // "VotingWorks VxAdmin" -> "VxAdmin"
    const appName = document.title.replace('VotingWorks', '').trim();
    assert(/^[a-z0-9]+$/i.test(appName));
    const defaultFileName = `Screenshot-${appName}-${new Date().toISOString()}.png`;

    setScreenshotToSave({ screenshot, fileName: defaultFileName });
    // eslint-disable-next-line no-param-reassign
    containerRef.current.style.visibility = 'visible';
  }

  async function onSaveScreenshot() {
    assert(screenshotToSave);
    await saveScreenshotForAppMutation.mutateAsync(screenshotToSave);
    setScreenshotToSave(undefined);
  }

  async function onKeyDown(event: KeyboardEvent): Promise<void> {
    if (event.key.toLowerCase() === 'k' && event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      await captureScreenshot();
    }
  }

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      <ScreenshotButton
        onClick={captureScreenshot}
        disabled={!window.kiosk}
        aria-label="Capture Screenshot"
      >
        <FontAwesomeIcon icon={faCamera} size="2x" />
      </ScreenshotButton>
      {screenshotToSave && (
        <ScreenshotModal
          title="Save Screenshot"
          onOverlayClick={() => setScreenshotToSave(undefined)}
          content={
            <>
              <P>The image will be saved to the Downloads folder as:</P>
              <input
                type="text"
                value={screenshotToSave.fileName}
                aria-label="Screenshot File Name"
                onChange={(e) =>
                  setScreenshotToSave({
                    ...screenshotToSave,
                    fileName: e.target.value,
                  })
                }
                onBlur={(e) =>
                  setScreenshotToSave({
                    ...screenshotToSave,
                    fileName: e.target.value.trim(),
                  })
                }
                autoComplete="off"
              />
            </>
          }
          actions={
            <>
              <Button
                autoFocus
                onPress={onSaveScreenshot}
                style={{
                  backgroundColor: Colors.ACTIVE,
                  color: Colors.BACKGROUND,
                }}
              >
                Save
              </Button>
              <Button
                onPress={() => setScreenshotToSave(undefined)}
                style={{
                  backgroundColor: 'white',
                }}
              >
                Cancel
              </Button>
            </>
          }
        />
      )}
    </>
  );
}

const IconButton = styled.button<{ isActive: boolean }>`
  position: relative;
  background-color: white;
  width: 80px;
  height: 80px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 5px;
  border: ${(props) =>
    props.isActive
      ? `4px solid ${Colors.ACTIVE}`
      : `1px solid ${Colors.BORDER}`};
  color: ${(props) => (props.isActive ? Colors.ACTIVE : Colors.TEXT)};
  &:disabled {
    color: ${Colors.DISABLED};
    border-color: ${Colors.DISABLED};
  }
`;

function PrinterMockControl() {
  const queryClient = useQueryClient();
  const apiClient = useApiClient();
  const getPrinterStatusQuery = useQuery(['getPrinterStatus'], () =>
    apiClient.getPrinterStatus()
  );
  const connectPrinterMutation = useMutation(apiClient.connectPrinter, {
    onSuccess: async () =>
      await queryClient.invalidateQueries(['getPrinterStatus']),
  });
  const disconnectPrinterMutation = useMutation(apiClient.disconnectPrinter, {
    onSuccess: async () =>
      await queryClient.invalidateQueries(['getPrinterStatus']),
  });

  const status = getPrinterStatusQuery.data ?? undefined;

  function onPrinterClick() {
    if (status?.connected) {
      disconnectPrinterMutation.mutate();
    } else {
      connectPrinterMutation.mutate();
    }
  }

  const isFeatureEnabled = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.USE_MOCK_PRINTER
  );

  const disabled = !isFeatureEnabled || !getPrinterStatusQuery.isSuccess;

  const isConnected = status?.connected === true;
  return (
    <IconButton
      onClick={onPrinterClick}
      isActive={isConnected}
      disabled={disabled}
      aria-label="Printer"
    >
      <FontAwesomeIcon icon={faPrint} size="2xl" />
      {!isFeatureEnabled && (
        <UsbMocksDisabledMessage>
          <p>Printer mock disabled</p>
        </UsbMocksDisabledMessage>
      )}
    </IconButton>
  );
}

function QuickConfigureButton(): JSX.Element {
  const apiClient = useApiClient();
  const [error, setError] = useState<string>();
  const getElectionQuery = useElectionQuery();
  const quickConfigureMutation = useMutation(apiClient.quickConfigure, {
    onSuccess: () => {
      window.location.reload();
    },
    onError: (mutationError) => setError(extractErrorMessage(mutationError)),
  });

  // Machines can only be configured from an election package, so a bare
  // election definition has nothing to configure from.
  const isElectionPackageSelected = Boolean(
    getElectionQuery.data?.isElectionPackage
  );

  return (
    <IconButton
      isActive={quickConfigureMutation.isLoading}
      disabled={!isElectionPackageSelected || quickConfigureMutation.isLoading}
      onClick={() => {
        setError(undefined);
        quickConfigureMutation.mutate();
      }}
      aria-label="Quick Configure"
    >
      <FontAwesomeIcon icon={faGift} size="2xl" />
      {!isElectionPackageSelected && (
        <UsbMocksDisabledMessage>
          <p>Select an election package</p>
        </UsbMocksDisabledMessage>
      )}
      {isElectionPackageSelected && error && (
        <UsbMocksDisabledMessage>
          <p>{error}</p>
        </UsbMocksDisabledMessage>
      )}
    </IconButton>
  );
}

function HardwareMockControls() {
  const queryClient = useQueryClient();
  const apiClient = useApiClient();
  const getHardwareMockStatusQuery = useQuery(
    ['getHardwareMockStatus'],
    () => apiClient.getHardwareMockStatus(),
    { refetchInterval: 1000 }
  );
  const setBarcodeConnectedMutation = useMutation(
    apiClient.setBarcodeConnected,
    {
      onSuccess: async () =>
        await queryClient.invalidateQueries(['getHardwareMockStatus']),
    }
  );
  const setPatInputConnectedMutation = useMutation(
    apiClient.setPatInputConnected,
    {
      onSuccess: async () =>
        await queryClient.invalidateQueries(['getHardwareMockStatus']),
    }
  );
  const setAccessibleConnectedMutation = useMutation(
    apiClient.setAccessibleControllerConnected,
    {
      onSuccess: async () =>
        await queryClient.invalidateQueries(['getHardwareMockStatus']),
    }
  );
  const isXkeysMockEnabled = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.USE_MOCK_XKEYS
  );
  const isBarcodeMockEnabled = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.USE_MOCK_BARCODE_READER
  );
  const isAccessibleControllerMockEnabled = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.USE_MOCK_ACCESSIBLE_CONTROLLER
  );

  const status = getHardwareMockStatusQuery.data ?? {
    barcodeConnected: false,
    patInputConnected: false,
    accessibleControllerConnected: false,
  };
  return (
    <>
      <IconButton
        isActive={status.barcodeConnected}
        disabled={!isBarcodeMockEnabled}
        onClick={() =>
          setBarcodeConnectedMutation.mutate({
            connected: !status.barcodeConnected,
          })
        }
        aria-label="Barcode Reader"
      >
        <FontAwesomeIcon icon={faQrcode} size="2xl" />
        {!isBarcodeMockEnabled && (
          <UsbMocksDisabledMessage>
            <p>Hardware mock disabled</p>
          </UsbMocksDisabledMessage>
        )}
      </IconButton>
      <IconButton
        isActive={status.patInputConnected}
        disabled={!isXkeysMockEnabled}
        onClick={() =>
          setPatInputConnectedMutation.mutate({
            connected: !status.patInputConnected,
          })
        }
        aria-label="PAT Input"
      >
        <FontAwesomeIcon icon={faXmark} size="2xl" />
        {!isAccessibleControllerMockEnabled && (
          <UsbMocksDisabledMessage>
            <p>Hardware mock disabled</p>
          </UsbMocksDisabledMessage>
        )}
      </IconButton>
      <IconButton
        isActive={status.accessibleControllerConnected}
        disabled={!isAccessibleControllerMockEnabled}
        onClick={() =>
          setAccessibleConnectedMutation.mutate({
            connected: !status.accessibleControllerConnected,
          })
        }
        aria-label="Accessible Controller"
      >
        <FontAwesomeIcon icon={faGamepad} size="2xl" />
        {!isAccessibleControllerMockEnabled && (
          <UsbMocksDisabledMessage>
            <p>Hardware mock disabled</p>
          </UsbMocksDisabledMessage>
        )}
      </IconButton>
    </>
  );
}

const ScannerButton = styled.button`
  background-color: white;
  padding: 8px 22px;
  border-radius: 8px;
  border: 1px solid ${Colors.BORDER};
  color: ${Colors.TEXT};

  &:active {
    color: ${Colors.ACTIVE};
    border-color: ${Colors.ACTIVE};
  }
  &:disabled {
    color: ${Colors.DISABLED};
    border-color: ${Colors.DISABLED};
  }
`;

const ScannerControls = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const CopiesInput = styled.input`
  width: 70px;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid ${Colors.BORDER};
  color: ${Colors.TEXT};
`;

const BatchScannerControls = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

function BatchScannerMockControl() {
  const queryClient = useQueryClient();
  const apiClient = useApiClient();
  const getStatusQuery = useQuery(
    ['batchScannerGetStatus'],
    () => apiClient.batchScannerGetStatus(),
    { refetchInterval: 1000 }
  );
  const loadBallotsMutation = useMutation(apiClient.batchScannerLoadBallots, {
    onSuccess: async () =>
      await queryClient.invalidateQueries(['batchScannerGetStatus']),
  });
  const clearBallotsMutation = useMutation(apiClient.batchScannerClearBallots, {
    onSuccess: async () =>
      await queryClient.invalidateQueries(['batchScannerGetStatus']),
  });
  const setErrorQueuedMutation = useMutation(
    apiClient.batchScannerSetErrorQueued,
    {
      onSuccess: async () =>
        await queryClient.invalidateQueries(['batchScannerGetStatus']),
    }
  );
  const setCopiesMutation = useMutation(apiClient.batchScannerSetCopies, {
    onSuccess: async () =>
      await queryClient.invalidateQueries(['batchScannerGetStatus']),
  });
  const [copies, setCopies] = useState(1);

  const status = getStatusQuery.data;
  const sheetCount = status?.sheetCount ?? 0;
  const errorQueued = status?.errorQueued ?? false;

  return (
    <BatchScannerControls>
      <ScannerControls>
        <strong>Batch Scanner:</strong>
        <ScannerButton
          onClick={async () => {
            const dialogResult = await assertDefined(
              window.kiosk
            ).showOpenDialog({
              properties: ['openFile', 'multiSelections'],
              filters: [
                { name: 'Ballots', extensions: ['pdf', 'jpg', 'jpeg', 'png'] },
              ],
            });
            if (dialogResult.canceled) return;
            // @coverage-defer
            if (dialogResult.filePaths.length > 0) {
              loadBallotsMutation.mutate({ paths: dialogResult.filePaths });
            }
          }}
          disabled={loadBallotsMutation.isLoading}
        >
          {/* @coverage-defer */}
          {loadBallotsMutation.isLoading ? 'Loading...' : 'Load Ballots'}
        </ScannerButton>
        ×
        <CopiesInput
          aria-label="Copies"
          type="number"
          min={1}
          value={copies}
          onChange={(event) => {
            const value = event.target.valueAsNumber;
            const newCopies = Number.isNaN(value)
              ? 1
              : Math.max(1, Math.floor(value));
            setCopies(newCopies);
            setCopiesMutation.mutate({ copies: newCopies });
          }}
        />
      </ScannerControls>
      <ScannerControls>
        {sheetCount > 0 && <span>{sheetCount} sheet(s) queued</span>}
        <ScannerButton
          onClick={() => clearBallotsMutation.mutate()}
          disabled={sheetCount === 0}
        >
          Clear
        </ScannerButton>
        <ScannerButton
          onClick={() =>
            setErrorQueuedMutation.mutate({ errorQueued: !errorQueued })
          }
          disabled={setErrorQueuedMutation.isLoading}
        >
          {errorQueued ? 'Cancel Error' : 'Queue Error'}
        </ScannerButton>
      </ScannerControls>
    </BatchScannerControls>
  );
}

function PdiScannerMockControl() {
  const queryClient = useQueryClient();
  const apiClient = useApiClient();
  const getStatusQuery = useQuery(
    ['pdiScannerGetStatus'],
    () => apiClient.pdiScannerGetStatus(),
    { refetchInterval: 500 }
  );
  const insertSheetMutation = useMutation(apiClient.pdiScannerInsertSheets, {
    onSuccess: async () =>
      await queryClient.invalidateQueries(['pdiScannerGetStatus']),
  });
  const removeSheetMutation = useMutation(apiClient.pdiScannerRemoveSheet);
  const clearSheetQueueMutation = useMutation(
    apiClient.pdiScannerClearSheetQueue,
    {
      onSuccess: async () =>
        await queryClient.invalidateQueries(['pdiScannerGetStatus']),
    }
  );

  const { sheetStatus, queue } = getStatusQuery.data ?? {};
  const canInsert =
    sheetStatus === 'noSheetEnabled' &&
    !queue &&
    !insertSheetMutation.isLoading;
  const canClear =
    queue &&
    queue.total > 1 &&
    !insertSheetMutation.isLoading &&
    !removeSheetMutation.isLoading &&
    !clearSheetQueueMutation.isLoading;

  async function onInsertBallot() {
    const dialogResult = await assertDefined(window.kiosk).showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: '', extensions: ['pdf'] }],
    });
    if (dialogResult.canceled) return;
    const selectedPath = dialogResult.filePaths[0];
    // @coverage-defer
    if (selectedPath) {
      insertSheetMutation.mutate({ path: selectedPath });
    }
  }

  return (
    <ScannerControls>
      <strong>
        Scanner:{' '}
        {queue && queue.total > 1 ? `${queue.inserted}/${queue.total}` : ''}
      </strong>
      {sheetStatus === 'sheetHeldInFront' ? (
        <ScannerButton
          onClick={() => removeSheetMutation.mutate()}
          disabled={removeSheetMutation.isLoading}
        >
          Remove Ballot
        </ScannerButton>
      ) : (
        <ScannerButton onClick={onInsertBallot} disabled={!canInsert}>
          {/* @coverage-defer */}
          {insertSheetMutation.isLoading ? 'Loading...' : 'Insert Ballot'}
        </ScannerButton>
      )}
      <ScannerButton
        onClick={() => clearSheetQueueMutation.mutate()}
        disabled={!canClear}
      >
        Clear
      </ScannerButton>
    </ScannerControls>
  );
}

const DOCK_SIDES: readonly DevDockSide[] = ['top', 'right', 'bottom', 'left'];

/* When closed, the dock slides off-screen far enough to hide its shadow, and
 * the handle is offset in the opposite direction to compensate so it stays
 * visible. */
const CONTAINER_SIDE_STYLES: Record<DevDockSide, FlattenSimpleInterpolation> = {
  top: css`
    top: 0;
    left: 0;
    width: 100%;
    flex-direction: column;
    &.closed {
      transform: translateY(-100%);
      #handle {
        top: 60px;
      }
    }
  `,
  right: css`
    top: 0;
    right: 0;
    height: 100%;
    flex-direction: row-reverse;
    &.closed {
      transform: translateX(100%);
      #handle {
        left: -60px;
      }
    }
  `,
  bottom: css`
    bottom: 0;
    left: 0;
    width: 100%;
    flex-direction: column-reverse;
    &.closed {
      transform: translateY(100%);
      #handle {
        top: -60px;
      }
    }
  `,
  left: css`
    top: 0;
    left: 0;
    height: 100%;
    flex-direction: row;
    &.closed {
      transform: translateX(-100%);
      #handle {
        left: 60px;
      }
    }
  `,
};

const Container = styled.div<{ side: DevDockSide }>`
  position: fixed;
  display: flex;
  align-items: center;
  z-index: 1000; /* Above react-modal z-index of 999 */
  pointer-events: none;
  /* Draw a unified shadow around the content and handle */
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.35))
    drop-shadow(0 0 2px #291649);

  @media print {
    display: none; /* Do not print the dock */
  }
  *:focus {
    outline: none;
  }

  /* Animate sliding open/closed */
  transition: all 0.15s ease-out;
  &.closed {
    transition: all 0.15s ease-out;
  }
  ${(props) => CONTAINER_SIDE_STYLES[props.side]}
`;

const CONTENT_BORDER_RADIUS: Record<DevDockSide, string> = {
  top: '0 0 10px 10px',
  right: '10px 0 0 10px',
  bottom: '10px 10px 0 0',
  left: '0 10px 10px 0',
};

const Content = styled.div<{ side: DevDockSide }>`
  font-size: 24px !important;
  background-color: ${Colors.BACKGROUND};
  padding: 15px 15px 20px 15px;
  display: flex;
  flex-direction: column;
  gap: 15px;
  pointer-events: auto;
  border-radius: ${(props) => CONTENT_BORDER_RADIUS[props.side]};
`;

const HANDLE_SIDE_STYLES: Record<DevDockSide, FlattenSimpleInterpolation> = {
  top: css`
    height: 60px;
    width: 100px;
    border-radius: 0 0 10px 10px;
    top: -2px;
  `,
  right: css`
    height: 100px;
    width: 60px;
    border-radius: 10px 0 0 10px;
    left: 2px;
  `,
  bottom: css`
    height: 60px;
    width: 100px;
    border-radius: 10px 10px 0 0;
    top: 2px;
  `,
  left: css`
    height: 100px;
    width: 60px;
    border-radius: 0 10px 10px 0;
    left: -2px;
  `,
};

const Handle = styled.button<{ side: DevDockSide }>`
  background-color: ${Colors.BACKGROUND};
  border-width: 0;
  pointer-events: auto;
  position: relative;
  /* Overlap with content so that filter shadow is not visible */
  ${(props) => HANDLE_SIDE_STYLES[props.side]}
`;

const HANDLE_CARET_ICONS: Record<
  DevDockSide,
  { open: IconDefinition; closed: IconDefinition }
> = {
  top: { open: faCaretUp, closed: faCaretDown },
  right: { open: faCaretRight, closed: faCaretLeft },
  bottom: { open: faCaretDown, closed: faCaretUp },
  left: { open: faCaretLeft, closed: faCaretRight },
};

const DOCK_SIDE_ICONS: Record<DevDockSide, IconDefinition> = {
  top: faArrowUp,
  right: faArrowRight,
  bottom: faArrowDown,
  left: faArrowLeft,
};

const DOCK_SIDE_LABELS: Record<DevDockSide, string> = {
  top: 'Top',
  right: 'Right',
  bottom: 'Bottom',
  left: 'Left',
};

const DockSideControlContainer = styled.div`
  position: relative;
`;

const DockSideControlButton = styled.button`
  height: 100%;
  background-color: white;
  border: 1px solid ${Colors.BORDER};
  border-radius: 4px;
  padding: 0 10px;
  color: ${Colors.TEXT};

  &:active {
    color: ${Colors.ACTIVE};
    border-color: ${Colors.ACTIVE};
  }
`;

const DockSideMenu = styled.div`
  position: absolute;
  top: calc(100% + 5px);
  right: 0;
  z-index: 1;
  background-color: ${Colors.BACKGROUND};
  border: 1px solid ${Colors.BORDER};
  border-radius: 4px;
  padding: 5px;
  display: flex;
  flex-direction: column;
  gap: 5px;
`;

const DockSideMenuItem = styled.button<{ isActive: boolean }>`
  background-color: white;
  border: ${(props) =>
    props.isActive
      ? `2px solid ${Colors.ACTIVE}`
      : `1px solid ${Colors.BORDER}`};
  color: ${(props) => (props.isActive ? Colors.ACTIVE : Colors.TEXT)};
  border-radius: 4px;
  padding: 6px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
`;

function DockSideControl({ side }: { side: DevDockSide }): JSX.Element {
  const queryClient = useQueryClient();
  const apiClient = useApiClient();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const setDockSideMutation = useMutation(apiClient.setDockSide, {
    onSuccess: async () => await queryClient.invalidateQueries(['getDockSide']),
  });

  function onSelectSide(newSide: DevDockSide) {
    setIsMenuOpen(false);
    if (newSide !== side) {
      setDockSideMutation.mutate({ side: newSide });
    }
  }

  return (
    <DockSideControlContainer>
      <DockSideControlButton
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        aria-label="Dock Position"
        aria-expanded={isMenuOpen}
      >
        <FontAwesomeIcon icon={faGear} size="sm" />
      </DockSideControlButton>
      {isMenuOpen && (
        <DockSideMenu>
          {DOCK_SIDES.map((menuSide) => (
            <DockSideMenuItem
              key={menuSide}
              isActive={menuSide === side}
              aria-pressed={menuSide === side}
              onClick={() => onSelectSide(menuSide)}
            >
              <FontAwesomeIcon icon={DOCK_SIDE_ICONS[menuSide]} />
              {DOCK_SIDE_LABELS[menuSide]}
            </DockSideMenuItem>
          ))}
        </DockSideMenu>
      )}
    </DockSideControlContainer>
  );
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: 'always',
        staleTime: Infinity,
        // @coverage-defer
        onError: (error) => {
          // eslint-disable-next-line no-console
          console.error('Dev Dock error:', error);
        },
      },
      mutations: {
        networkMode: 'always',
        // @coverage-defer
        onError: (error) => {
          // eslint-disable-next-line no-console
          console.error('Dev Dock error:', error);
        },
      },
    },
  });
}

function DevDock(props: { enableAccessibleNav?: boolean }) {
  const { enableAccessibleNav } = props;
  const [isOpen, setIsOpen] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const apiClient = useApiClient();

  const getMockSpecQuery = useQuery(['getMockSpec'], () =>
    apiClient.getMockSpec()
  );
  const getDockSideQuery = useQuery(['getDockSide'], () =>
    apiClient.getDockSide()
  );

  function onKeyDown(event: KeyboardEvent): void {
    // @coverage-defer
    if (event.key.toLowerCase() === 'd' && event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      setIsOpen((previousIsOpen) => !previousIsOpen);
    }
    // @coverage-defer
    if (isOpen) {
      if (event.key === 'Escape') setIsOpen(false);
    }
  }

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!getMockSpecQuery.isSuccess || !getDockSideQuery.isSuccess) return null;
  const mockSpec = getMockSpecQuery.data;
  const side = getDockSideQuery.data;

  // Quick configure stages an election package on the mock USB drive, programs
  // an election manager card for it, and lets the machine configure itself.
  // The following flags are required:
  //
  // - SKIP_ELECTION_PACKAGE_AUTHENTICATION: package is not assumed to be signed.
  // - USE_MOCK_USB_DRIVE, USE_MOCK_CARDS: only the mock drive and mock cards
  //   are supported for quick configure.
  // - SKIP_PIN_ENTRY: pin entry screen is not automatically handled by this flow.
  const isQuickConfigureEnabled =
    isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
    ) &&
    isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_USB_DRIVE) &&
    isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_CARDS) &&
    isFeatureFlagEnabled(BooleanEnvironmentVariableName.SKIP_PIN_ENTRY);

  return (
    <Container
      aria-hidden={!enableAccessibleNav}
      ref={containerRef}
      className={isOpen ? '' : 'closed'}
      side={side}
      // Don't flip the dev dock when using an RTL language
      dir="ltr"
    >
      <Content side={side}>
        <Row>
          <ElectionControl />
          <DockSideControl side={side} />
        </Row>
        <Row>
          <Column>
            <Row>
              <SmartCardMockControls />
            </Row>
          </Column>
          <Column>
            <UsbDriveMockControls />
          </Column>
          <Column>
            <IconsGrid>
              <ScreenshotControls containerRef={containerRef} />
              {mockSpec.printerConfig &&
                mockSpec.printerConfig !== 'fujitsu' && <PrinterMockControl />}
              {(mockSpec.hasBarcodeMock || mockSpec.hasPatInputMock) && (
                <HardwareMockControls />
              )}
              {mockSpec.hasQuickConfigure && isQuickConfigureEnabled && (
                <QuickConfigureButton />
              )}
            </IconsGrid>
          </Column>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          {mockSpec.printerConfig === 'fujitsu' && (
            <FujitsuPrinterMockControl />
          )}
          {mockSpec.mockPdiScanner && <PdiScannerMockControl />}
          {mockSpec.mockBatchScanner && <BatchScannerMockControl />}
        </Row>
      </Content>
      <Handle
        id="handle"
        side={side}
        aria-label="Toggle Dock"
        onClick={() => setIsOpen(!isOpen)}
      >
        <FontAwesomeIcon
          icon={HANDLE_CARET_ICONS[side][isOpen ? 'open' : 'closed']}
          size="lg"
        />
      </Handle>
    </Container>
  );
}

/**
 * Dev dock component. Render at the top level of an app.
 *
 * The dock will only be rendered if the ENABLE_DEV_DOCK feature flag is turned
 * on.
 */
function DevDockWrapper({
  // @coverage-defer
  apiClient = grout.createClient<Api>({ baseUrl: '/dock' }),
  enableAccessibleNav,
}: {
  apiClient?: ApiClient;
  /**
   * Add the dev dock controls to the accessibility tree (for testing). They are
   * omitted by default to prevent interference with navigation in the main app.
   */
  enableAccessibleNav?: boolean;
}): JSX.Element | null {
  const [queryClient] = useState(createQueryClient);

  // We use a wrapper component to make sure that not only is the dock not
  // inserted into the DOM, but its keyboard listeners are not registered
  // either.
  return isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.ENABLE_DEV_DOCK
  ) ? (
    <QueryClientProvider client={queryClient}>
      <VxThemeProvider colorMode="desktop" sizeMode="desktop">
        <ApiClientContext.Provider value={apiClient}>
          <DevDock enableAccessibleNav={enableAccessibleNav} />
          {/* eslint-disable-next-line no-constant-binary-expression */}
          {false && (
            /* @coverage-defer */ <ReactQueryDevtools initialIsOpen={false} />
          )}
        </ApiClientContext.Provider>
      </VxThemeProvider>
    </QueryClientProvider>
  ) : null;
}

export { DevDockWrapper as DevDock };
