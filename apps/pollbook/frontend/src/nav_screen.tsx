import React, { useState } from 'react';
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
  NavLink,
  NavList,
  NavListItem,
  Screen,
  Table,
} from '@votingworks/ui';
import { Link, useRouteMatch } from 'react-router-dom';
import styled from 'styled-components';
import type { PrinterStatus } from '@votingworks/types';
import { type NetworkStatus } from '@votingworks/pollbook-backend';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import type { BatteryInfo } from '@votingworks/backend';
import { format } from '@votingworks/utils';
import { Row } from './layout';
import { getDeviceStatuses, resetNetwork, logOut } from './api';
import { PollbookConnectionStatus } from './types';

export const DeviceInfoBar = styled(Row)`
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  width: 100%;
  background: ${(p) => p.theme.colors.inverseContainer};
  color: ${(p) => p.theme.colors.onInverse};
  padding: 0.25rem 1rem;
`;

export const Header = styled(MainHeader)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 0.75rem;
  gap: 0.5rem;
`;

function NetworkStatus({ status }: { status: NetworkStatus }) {
  const [showModal, setShowModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const sortedPollbooks = [...status.pollbooks].sort((a, b) => {
    if (
      a.status === PollbookConnectionStatus.Connected &&
      b.status !== PollbookConnectionStatus.Connected
    ) {
      return -1;
    }
    if (
      a.status !== PollbookConnectionStatus.Connected &&
      b.status === PollbookConnectionStatus.Connected
    ) {
      return 1;
    }
    if (
      a.status === PollbookConnectionStatus.LostConnection ||
      a.status === PollbookConnectionStatus.ShutDown
    ) {
      return -1;
    }
    if (
      b.status === PollbookConnectionStatus.LostConnection ||
      b.status === PollbookConnectionStatus.ShutDown
    ) {
      return 1;
    }
    return 0;
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
    >
      <Icons.Antenna color="inverse" style={{ cursor: 'pointer' }} />
      {status.isOnline ? (
        status.pollbooks.filter(
          (pollbook) => pollbook.status === PollbookConnectionStatus.Connected
        ).length
      ) : isResetting ? (
        <Icons.Loading />
      ) : (
        <Icons.Warning color="inverseWarning" />
      )}
      {showModal && (
        <Modal
          title="Network Details"
          content={
            <div
              style={{
                padding: '1rem',
                borderRadius: '0.25rem',
                boxShadow: '0 0.5rem 1rem rgba(0, 0, 0, 0.1)',
              }}
            >
              {!status.isOnline && !isResetting && (
                <div style={{ alignContent: 'center' }}>
                  <p>Network is offline.</p>
                </div>
              )}
              {isResetting && (
                <div>
                  <Icons.Loading /> <br />{' '}
                  <p>Resetting network connection...</p>
                </div>
              )}
              {sortedPollbooks.length === 0 && status.isOnline && (
                <span>No pollbooks found</span>
              )}
              {status.isOnline &&
                !isResetting &&
                sortedPollbooks.length > 0 && (
                  <Table>
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Machine ID</th>
                        <th>Last Seen</th>
                        <th># Check-ins</th>
                      </tr>
                    </thead>
                    {sortedPollbooks.map((pollbook) => (
                      <tr
                        key={pollbook.machineId}
                        style={{ gap: '0.5rem', alignItems: 'center' }}
                      >
                        <td>
                          {pollbook.status ===
                            PollbookConnectionStatus.Connected && (
                            <Icons.Checkmark color="primary" />
                          )}
                          {(pollbook.status ===
                            PollbookConnectionStatus.LostConnection ||
                            pollbook.status ===
                              PollbookConnectionStatus.ShutDown) && (
                            <Icons.Warning color="inverseWarning" />
                          )}
                          {pollbook.status ===
                            PollbookConnectionStatus.WrongElection && (
                            <Icons.X color="danger" />
                          )}
                        </td>
                        <td>{pollbook.machineId}</td>
                        <td>{new Date(pollbook.lastSeen).toLocaleString()}</td>
                        <td>{pollbook.numCheckIns} check-ins</td>
                      </tr>
                    ))}
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

function Statuses() {
  const getDeviceStatusesQuery = getDeviceStatuses.useQuery();
  if (!getDeviceStatusesQuery.isSuccess) {
    return null;
  }
  const { network, battery, usbDrive, printer } = getDeviceStatusesQuery.data;
  return (
    <Row style={{ gap: '1.5rem' }}>
      <NetworkStatus status={network} />
      <PrinterStatus status={printer} />
      <UsbStatus status={usbDrive} />
      <BatteryStatus status={battery} />
      <LogOutButton />
    </Row>
  );
}

export function NavScreen({
  navContent,
  children,
}: {
  navContent?: React.ReactNode;
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <Screen flexDirection="row">
      <LeftNav style={{ width: '13rem' }}>
        <Link to="/">
          <AppLogo appName="VxPollbook" />
        </Link>
        {navContent}
      </LeftNav>
      <Main flexColumn>
        <DeviceInfoBar>
          <div />
          <Statuses />
        </DeviceInfoBar>
        {children}
      </Main>
    </Screen>
  );
}

export const electionManagerRoutes = {
  election: { title: 'Election', path: '/election' },
  voters: { title: 'Voters', path: '/voters' },
  settings: { title: 'Settings', path: '/settings' },
} satisfies Record<string, { title: string; path: string }>;

export function ElectionManagerNavScreen({
  title,
  children,
}: {
  title: string;
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
      <Header>
        <H1>{title}</H1>
      </Header>
      {children}
    </NavScreen>
  );
}

export const pollWorkerRoutes = {
  checkIn: { title: 'Check-In', path: '/check-in' },
  addVoter: { title: 'Registration', path: '/registration' },
} satisfies Record<string, { title: string; path: string }>;

export function PollWorkerNavScreen({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  const currentRoute = useRouteMatch();

  return (
    <NavScreen
      navContent={
        <NavList>
          {Object.values(pollWorkerRoutes).map((route) => (
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
      {children}
    </NavScreen>
  );
}

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
