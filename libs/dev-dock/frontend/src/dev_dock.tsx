import React, { RefObject, useEffect, useRef, useState } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import styled from 'styled-components';
import * as grout from '@votingworks/grout';
import {
  assert,
  assertDefined,
  sleep,
  throwIllegalValue,
  uniqueBy,
} from '@votingworks/basics';
import type { Api, DevDockUserRole } from '@votingworks/dev-dock-backend';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCamera,
  faCaretDown,
  faCaretUp,
  faCircleDown,
  faPrint,
} from '@fortawesome/free-solid-svg-icons';
import {
  isFeatureFlagEnabled,
  BooleanEnvironmentVariableName,
} from '@votingworks/utils';
import { UsbDriveIcon } from './usb_drive_icon';
import { Colors } from './colors';
import { FujitsuPrinterMockControl } from './fujitsu_printer_mock';
import { ApiClient, ApiClientContext, useApiClient } from './api_client';

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

const ElectionControlSelect = styled.select`
  /* Use the exact width of the flex parent based on the width of the next row. */
  width: 0;
  min-width: 100%;
  padding: 8px;
  border-radius: 4px;
  background-color: white;
  option {
    font-size: 14px;
    padding: 0;
  }
`;

function ElectionControl(): JSX.Element | null {
  const queryClient = useQueryClient();
  const apiClient = useApiClient();
  const getElectionQuery = useQuery(
    ['getElection'],
    async () => (await apiClient.getElection()) ?? null
  );
  const currentFixturesQuery = useQuery(
    ['getCurrentFixtureElectionPaths'],
    async () => (await apiClient.getCurrentFixtureElectionPaths()) ?? null
  );
  const fixturesElections = currentFixturesQuery.data || [];
  const setElectionMutation = useMutation(apiClient.setElection, {
    onSuccess: async () => await queryClient.invalidateQueries(['getElection']),
  });

  if (!getElectionQuery.isSuccess) return <ElectionControlSelect />;

  const selectedElection = getElectionQuery.data;

  async function onSelectElection(
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const path = event.target.value;
    if (path === 'Pick from file...') {
      const dialogResult = await assertDefined(window.kiosk).showOpenDialog({
        properties: ['openFile'],
      });
      if (dialogResult.canceled) return;
      const selectedPath = dialogResult.filePaths[0];
      if (selectedPath) {
        setElectionMutation.mutate({ path: selectedPath });
      }
    } else {
      setElectionMutation.mutate({ path });
    }
  }

  const elections = uniqueBy(
    fixturesElections.concat(selectedElection ?? []),
    (election) => election.path
  );

  return (
    <ElectionControlSelect
      value={selectedElection?.path}
      onChange={onSelectElection}
    >
      {elections.map((election) => (
        <option key={election.path} value={election.path}>
          {election.title} - {election.path}
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

  const status = getUsbDriveStatusQuery.data ?? undefined;

  function onUsbDriveClick() {
    if (status === 'inserted') {
      removeUsbDriveMutation.mutate();
    } else {
      insertUsbDriveMutation.mutate();
    }
  }

  function onClearUsbDriveClick() {
    clearUsbDriveMutation.mutate();
  }

  const isFeatureEnabled = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.USE_MOCK_USB_DRIVE
  );

  const disabled = !isFeatureEnabled || !getUsbDriveStatusQuery.isSuccess;

  const isInserted = status === 'inserted';
  return (
    <Column>
      <UsbDriveControl
        onClick={onUsbDriveClick}
        isInserted={isInserted}
        disabled={disabled}
        aria-label="USB Drive"
      >
        <UsbDriveIcon isInserted={isInserted} disabled={disabled} />
        {!isFeatureEnabled && (
          <UsbMocksDisabledMessage>
            <p>USB mock disabled</p>
          </UsbMocksDisabledMessage>
        )}
      </UsbDriveControl>
      <UsbDriveClearButton onClick={onClearUsbDriveClick} disabled={disabled}>
        Clear
      </UsbDriveClearButton>
    </Column>
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

function ScreenshotControls({
  containerRef,
}: {
  containerRef: RefObject<HTMLDivElement>;
}) {
  const apiClient = useApiClient();
  const saveScreenshotForAppMutation = useMutation(
    apiClient.saveScreenshotForApp
  );

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
    const fileName = await saveScreenshotForAppMutation.mutateAsync({
      appName,
      screenshot,
    });

    // eslint-disable-next-line no-param-reassign
    containerRef.current.style.visibility = 'visible';

    if (fileName) {
      // eslint-disable-next-line no-alert
      alert(`Screenshot saved as ${fileName} in the Downloads folder.`);
    }
  }

  return (
    <ScreenshotButton
      onClick={captureScreenshot}
      disabled={!window.kiosk}
      aria-label="Capture Screenshot"
    >
      <FontAwesomeIcon icon={faCamera} size="2x" />
    </ScreenshotButton>
  );
}

const PrinterButton = styled.button<{ isConnected: boolean }>`
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
    props.isConnected
      ? `4px solid ${Colors.ACTIVE}`
      : `1px solid ${Colors.BORDER}`};
  color: ${(props) => (props.isConnected ? Colors.ACTIVE : Colors.TEXT)};
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
    <PrinterButton
      onClick={onPrinterClick}
      isConnected={isConnected}
      disabled={disabled}
      aria-label="Printer"
    >
      <FontAwesomeIcon icon={faPrint} size="2xl" />
      {!isFeatureEnabled && (
        <UsbMocksDisabledMessage>
          <p>Printer mock disabled</p>
        </UsbMocksDisabledMessage>
      )}
    </PrinterButton>
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

const Container = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
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

  /* Slide the dock up when closed */
  &.closed {
    /* Slide up enough to hide the shadow */
    transform: translateY(-100%);
    transition: all 0.15s ease-out;
    /* Move the handle down a bit to compensate for sliding up extra to hide the
     * shadow */
    #handle {
      top: 60px;
    }
  }
  /* Slide the dock down when open */
  transition: all 0.15s ease-out;
  aria-hidden: true;
`;

const Content = styled.div`
  font-size: 24px !important;
  background-color: ${Colors.BACKGROUND};
  padding: 15px 15px 20px 15px;
  display: flex;
  flex-direction: column;
  gap: 15px;
  pointer-events: auto;
  border-radius: 0px 0px 10px 10px;
`;

const Handle = styled.button`
  background-color: ${Colors.BACKGROUND};
  height: 60px;
  width: 100px;
  border-width: 0;
  pointer-events: auto;
  border-radius: 0px 0px 10px 10px;
  position: relative;
  /* Overlap with content so that filter shadow is not visible */
  top: -2px;
`;

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: 'always',
        staleTime: Infinity,
        onError: (error) => {
          // eslint-disable-next-line no-console
          console.error('Dev Dock error:', error);
        },
      },
      mutations: {
        networkMode: 'always',
        onError: (error) => {
          // eslint-disable-next-line no-console
          console.error('Dev Dock error:', error);
        },
      },
    },
  });
}

function DevDock() {
  const [isOpen, setIsOpen] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const apiClient = useApiClient();

  const getMockSpecQuery = useQuery(['getMockSpec'], () =>
    apiClient.getMockSpec()
  );

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'd' && event.metaKey) {
      setIsOpen((previousIsOpen) => !previousIsOpen);
    }
    if (isOpen) {
      if (event.key === 'Escape') setIsOpen(false);
    }
  }

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!getMockSpecQuery.isSuccess) return null;
  const mockSpec = getMockSpecQuery.data;

  return (
    <Container ref={containerRef} className={isOpen ? '' : 'closed'}>
      <Content>
        <Row>
          <ElectionControl />
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
            <ScreenshotControls containerRef={containerRef} />
            {mockSpec.printerConfig && mockSpec.printerConfig !== 'fujitsu' && (
              <PrinterMockControl />
            )}
          </Column>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          {mockSpec.printerConfig === 'fujitsu' && (
            <FujitsuPrinterMockControl />
          )}
        </Row>
      </Content>
      <Handle id="handle" onClick={() => setIsOpen(!isOpen)}>
        <FontAwesomeIcon icon={isOpen ? faCaretUp : faCaretDown} size="lg" />
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
  apiClient = grout.createClient<Api>({ baseUrl: '/dock' }),
}: {
  apiClient?: ApiClient;
}): JSX.Element | null {
  // We use a wrapper component to make sure that not only is the dock not
  // inserted into the DOM, but its keyboard listeners are not registered
  // either.
  return isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.ENABLE_DEV_DOCK
  ) ? (
    <QueryClientProvider client={createQueryClient()}>
      <ApiClientContext.Provider value={apiClient}>
        <DevDock />
        {false && <ReactQueryDevtools initialIsOpen={false} />}
      </ApiClientContext.Provider>
    </QueryClientProvider>
  ) : null;
}

export { DevDockWrapper as DevDock };
