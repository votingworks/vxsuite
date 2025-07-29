import React, { useEffect, useState } from 'react';
import {
  AppLogo,
  Button,
  getBatteryIcon,
  H1,
  Icons,
  LeftNav,
  Main,
  MainHeader,
  Modal,
  ModalWidth,
  NavLink,
  NavList,
  NavListItem,
  Screen,
  Table,
} from '@votingworks/ui';
import { Link, useRouteMatch } from 'react-router-dom';
import { DateTime } from 'luxon';
import styled from 'styled-components';
import { formatElectionHashes, type PrinterStatus } from '@votingworks/types';
import type {
  BarcodeScannerStatus,
  NetworkStatus,
  PollbookConfigurationInformation,
  PollbookServiceInfo,
} from '@votingworks/pollbook-backend';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import type { BatteryInfo } from '@votingworks/backend';
import { format } from '@votingworks/utils';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { Row } from './layout';
import {
  getDeviceStatuses,
  resetNetwork,
  logOut,
  getElection,
  getPollbookConfigurationInformation,
} from './api';
import { PollbookConnectionStatus } from './types';
import { VerticalElectionInfoBar } from './election_info_bar';

export const Header = styled(MainHeader)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 0.75rem;
  gap: 0.5rem;
`;

function isCurrentMachineConfigured(
  currentMachineConfiguration: PollbookConfigurationInformation
): boolean {
  return (
    !!currentMachineConfiguration.electionBallotHash &&
    !!currentMachineConfiguration.configuredPrecinctId
  );
}

function getIconAndLabelForPollbookConnection(
  pollbook: PollbookServiceInfo,
  currentMachineConfiguration: PollbookConfigurationInformation
): [React.ReactNode, string] {
  const typedStatus = pollbook.status;
  switch (typedStatus) {
    case PollbookConnectionStatus.Connected: {
      assert(isCurrentMachineConfigured(currentMachineConfiguration));
      return [
        <Icons.Checkmark key={pollbook.machineId} color="success" />,
        'Synced',
      ];
    }
    case PollbookConnectionStatus.LostConnection: {
      return [
        <Icons.Warning key={pollbook.machineId} color="warning" />,
        'Lost Connection',
      ];
    }
    case PollbookConnectionStatus.ShutDown: {
      return [
        <Icons.Info key={pollbook.machineId} color="neutral" />,
        'Powered Off',
      ];
    }
    case PollbookConnectionStatus.IncompatibleSoftwareVersion: {
      return [
        <Icons.Danger key={pollbook.machineId} color="danger" />,
        'Incompatible Machine',
      ];
    }
    case PollbookConnectionStatus.MismatchedConfiguration: {
      if (!isCurrentMachineConfigured(currentMachineConfiguration)) {
        return [
          <Icons.Info key={pollbook.machineId} color="neutral" />,
          'Connected',
        ];
      }
      if (
        currentMachineConfiguration.electionBallotHash !==
          pollbook.electionBallotHash ||
        currentMachineConfiguration.pollbookPackageHash !==
          pollbook.pollbookPackageHash
      ) {
        return [
          <Icons.Info key={pollbook.machineId} color="neutral" />,
          'Different Election',
        ];
      }
      return [
        <Icons.Info key={pollbook.machineId} color="neutral" />,
        'Different Precinct',
      ];
    }
    default: {
      /* istanbul ignore next - @preserve */
      throwIllegalValue(typedStatus as never);
    }
  }
}

function NetworkStatus({
  status,
  currentMachineConfiguration,
}: {
  status: NetworkStatus;
  currentMachineConfiguration: PollbookConfigurationInformation;
}) {
  const [showModal, setShowModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const connectionStatusOrder = [
    PollbookConnectionStatus.Connected,
    PollbookConnectionStatus.MismatchedConfiguration,
    PollbookConnectionStatus.LostConnection,
    PollbookConnectionStatus.ShutDown,
    PollbookConnectionStatus.IncompatibleSoftwareVersion,
  ];

  const sortedPollbooks = [...status.pollbooks].sort((a, b) => {
    const statusA = connectionStatusOrder.indexOf(a.status);
    const statusB = connectionStatusOrder.indexOf(b.status);
    if (statusA !== statusB) {
      return statusA - statusB;
    }
    return a.machineId.localeCompare(b.machineId);
  });

  const resetNetworkMutation = resetNetwork.useMutation();

  function resetNetworkConnection() {
    setIsResetting(true);
    resetNetworkMutation.mutate(undefined, {
      onSuccess: () => {
        setIsResetting(false);
      },
    });
  }

  return (
    <Row
      onClick={() => setShowModal(!showModal)}
      style={{ gap: '0.25rem', alignItems: 'center', position: 'relative' }}
      data-testid="network-status"
    >
      <Icons.Antenna color="inverse" style={{ cursor: 'pointer' }} />
      {status.isOnline ? (
        // Add one for the current machine
        1 +
        status.pollbooks.filter(
          (pollbook) =>
            pollbook.status ===
            (isCurrentMachineConfigured(currentMachineConfiguration)
              ? PollbookConnectionStatus.Connected
              : PollbookConnectionStatus.MismatchedConfiguration)
        ).length
      ) : isResetting ? (
        <Icons.Loading />
      ) : (
        <Icons.Warning color="inverseWarning" />
      )}
      {showModal && (
        <Modal
          modalWidth={ModalWidth.Wide}
          title="Network Details"
          content={
            <div>
              {!status.isOnline && !isResetting && (
                <div>Network is offline.</div>
              )}
              {isResetting && (
                <div>
                  <Icons.Loading /> Resetting network connection...
                </div>
              )}
              {sortedPollbooks.length === 0 && status.isOnline && (
                <span>No pollbooks found.</span>
              )}
              {status.isOnline &&
                !isResetting &&
                sortedPollbooks.length > 0 && (
                  <Table>
                    <thead>
                      <tr>
                        <th />
                        <th>Status</th>
                        <th>Machine ID</th>
                        <th>Election</th>
                        <th>Last Seen</th>
                        <th># Check-Ins</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPollbooks.map((pollbook) => {
                        const [icon, label] =
                          getIconAndLabelForPollbookConnection(
                            pollbook,
                            currentMachineConfiguration
                          );
                        return (
                          <tr
                            data-testid="pollbook-row"
                            key={pollbook.machineId}
                            style={{ gap: '0.5rem', alignItems: 'center' }}
                          >
                            <td>{icon}</td>
                            <td>{label}</td>
                            <td>{pollbook.machineId}</td>
                            <td>
                              {pollbook.electionBallotHash &&
                              pollbook.pollbookPackageHash
                                ? formatElectionHashes(
                                    pollbook.electionBallotHash,
                                    pollbook.pollbookPackageHash
                                  )
                                : ' - '}
                            </td>
                            <td>
                              {DateTime.fromJSDate(
                                new Date(pollbook.lastSeen)
                              ).toRelative()}
                            </td>
                            <td>{pollbook.numCheckIns} check-ins</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                )}
            </div>
          }
          actions={
            <React.Fragment>
              <Button onPress={resetNetworkConnection} color="primary">
                Reset Network
              </Button>
              <Button onPress={() => setShowModal(false)}>Close</Button>
            </React.Fragment>
          }
        />
      )}
    </Row>
  );
}

function BatteryStatus({ status }: { status?: BatteryInfo }) {
  return (
    <Row style={{ gap: '0.25rem', alignItems: 'center' }}>
      {getBatteryIcon(status, true)}
      {status && !status.discharging && (
        <Icons.Bolt style={{ fontSize: '0.8em' }} color="inverse" />
      )}
      {status && format.percent(status.level)}
      {status && status.level < 0.25 && status.discharging && (
        <Icons.Warning color="inverseWarning" />
      )}
    </Row>
  );
}

function UsbStatus({ status }: { status: UsbDriveStatus }) {
  return (
    <Row style={{ gap: '0.25rem', alignItems: 'center' }}>
      <Icons.UsbDrive color="inverse" />
      {status.status !== 'mounted' && <Icons.Warning color="inverseWarning" />}
    </Row>
  );
}

function BarcodeScannerStatus({ status }: { status: BarcodeScannerStatus }) {
  return (
    <Row
      data-testid="barcode-scanner-status"
      style={{ gap: '0.25rem', alignItems: 'center' }}
    >
      <Icons.IdCard color="inverse" />
      {!status.connected && <Icons.Warning color="inverseWarning" />}
    </Row>
  );
}

function PrinterStatus({ status }: { status: PrinterStatus }) {
  return (
    <Row style={{ gap: '0.25rem', alignItems: 'center' }}>
      <Icons.Print color="inverse" />
      {!status.connected && <Icons.Warning color="inverseWarning" />}
    </Row>
  );
}

export function LogOutButton(): JSX.Element {
  const logOutMutation = logOut.useMutation();
  return (
    <Button
      icon="Lock"
      onPress={() => logOutMutation.mutate()}
      color="inverseNeutral"
      style={{
        fontSize: '0.8rem',
        padding: '0.25rem 0.75rem',
      }}
    >
      Lock Machine
    </Button>
  );
}

export const DeviceInfoBar = styled(Row)`
  justify-content: flex-end;
  position: sticky;
  top: 0;
  width: 100%;
  background: ${(p) => p.theme.colors.inverseContainer};
  color: ${(p) => p.theme.colors.onInverse};
  padding: 0.25rem 1rem;
`;

function useCurrentDate(): Date {
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentDate(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return currentDate;
}

export function DeviceStatusBar({
  showLogOutButton = true,
} = {}): JSX.Element | null {
  const getDeviceStatusesQuery = getDeviceStatuses.useQuery();
  const getPollbookConfigurationInformationQuery =
    getPollbookConfigurationInformation.useQuery();
  const currentDate = useCurrentDate();
  if (
    !getDeviceStatusesQuery.isSuccess ||
    !getPollbookConfigurationInformationQuery.isSuccess
  ) {
    return null;
  }
  const { network, battery, usbDrive, printer, barcodeScanner } =
    getDeviceStatusesQuery.data;
  const pollbookConfiguration = getPollbookConfigurationInformationQuery.data;

  return (
    <DeviceInfoBar>
      <Row style={{ gap: '1.25rem', alignItems: 'center' }}>
        <NetworkStatus
          status={network}
          currentMachineConfiguration={pollbookConfiguration}
        />
        <PrinterStatus status={printer} />
        <BarcodeScannerStatus status={barcodeScanner} />
        <UsbStatus status={usbDrive} />
        <BatteryStatus status={battery} />
        {format.clockDateAndTime(currentDate)}
        {showLogOutButton && <LogOutButton />}
      </Row>
    </DeviceInfoBar>
  );
}

export function NavScreen({
  navContent,
  children,
}: {
  navContent?: React.ReactNode;
  children?: React.ReactNode;
}): JSX.Element | null {
  const getElectionQuery = getElection.useQuery();
  const getMachineInfoQuery = getPollbookConfigurationInformation.useQuery();

  if (!(getElectionQuery.isSuccess && getMachineInfoQuery.isSuccess)) {
    return null;
  }

  const election = getElectionQuery.data.ok();
  const {
    configuredPrecinctId,
    machineId,
    codeVersion,
    electionBallotHash,
    pollbookPackageHash,
  } = getMachineInfoQuery.data;

  return (
    <Screen flexDirection="row">
      <LeftNav style={{ width: '13rem' }}>
        <Link to="/">
          <AppLogo appName="VxPollBook" />
        </Link>
        {navContent}
        <div style={{ marginTop: 'auto' }}>
          <VerticalElectionInfoBar
            election={election}
            electionBallotHash={electionBallotHash}
            pollbookPackageHash={pollbookPackageHash}
            machineId={machineId}
            codeVersion={codeVersion}
            configuredPrecinctId={configuredPrecinctId}
            inverse
          />
        </div>
      </LeftNav>
      <Main flexColumn>
        <DeviceStatusBar />
        {children}
      </Main>
    </Screen>
  );
}

export const systemAdministratorRoutes = {
  election: { title: 'Election', path: '/election' },
  smartCards: { title: 'Smart Cards', path: '/smart-cards' },
  settings: { title: 'Settings', path: '/settings' },
} satisfies Record<string, { title: string; path: string }>;

export function SystemAdministratorNavScreen({
  title,
  children,
}: {
  title: string | React.ReactNode;
  children: React.ReactNode;
}): JSX.Element {
  const currentRoute = useRouteMatch();

  return (
    <NavScreen
      navContent={
        <NavList>
          {Object.values(systemAdministratorRoutes).map((route) => (
            <NavListItem key={route.path}>
              <NavLink
                to={route.path}
                isActive={route.path === currentRoute.url}
              >
                {route.title}
              </NavLink>
            </NavListItem>
          ))}
        </NavList>
      }
    >
      <Header>{typeof title === 'string' ? <H1>{title}</H1> : title}</Header>
      {children}
    </NavScreen>
  );
}

export const electionManagerRoutes = {
  election: { title: 'Election', path: '/election' },
  voters: { title: 'Voters', path: '/voters' },
  addVoter: { title: 'Registration', path: '/registration' },
  statistics: { title: 'Statistics', path: '/statistics' },
  settings: { title: 'Settings', path: '/settings' },
} satisfies Record<string, { title: string; path: string }>;

export function ElectionManagerNavScreen({
  title,
  children,
}: {
  title?: string | React.ReactNode;
  children: React.ReactNode;
}): JSX.Element {
  const currentRoute = useRouteMatch();

  return (
    <NavScreen
      navContent={
        <NavList>
          {Object.values(electionManagerRoutes).map((route) => (
            <NavListItem key={route.path}>
              <NavLink
                to={route.path}
                isActive={route.path === currentRoute.url}
              >
                {route.title}
              </NavLink>
            </NavListItem>
          ))}
        </NavList>
      }
    >
      {title && (
        <Header>{typeof title === 'string' ? <H1>{title}</H1> : title}</Header>
      )}
      {children}
    </NavScreen>
  );
}

export const pollWorkerRoutes = {
  checkIn: { title: 'Check-In', path: '/check-in' },
} satisfies Record<string, { title: string; path: string }>;

export function NoNavScreen({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <Screen flexDirection="row">
      <Main flexColumn>{children}</Main>
    </Screen>
  );
}
