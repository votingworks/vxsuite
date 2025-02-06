import React, { useState } from 'react';
import {
  AppLogo,
  Button,
  getBatteryIcon,
  Icons,
  LeftNav,
  LogoCircleWhiteOnPurple,
  Main,
  MainHeader,
  Modal,
  Screen,
  Table,
} from '@votingworks/ui';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import type { PrinterStatus } from '@votingworks/types';
import { type NetworkStatus } from '@votingworks/pollbook-backend';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import type { BatteryInfo } from '@votingworks/backend';
import { format } from '@votingworks/utils';
import { Row } from './layout';
import { getDeviceStatuses, resetNetwork } from './api';
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
              {status.isOnline ? null : (
                <Button onPress={resetNetworkConnection} color="primary">
                  Reset Network
                </Button>
              )}
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
      <LeftNav style={{ width: '14rem' }}>
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

export function NoNavScreen({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <Screen flexDirection="row">
      <Main flexColumn>
        <DeviceInfoBar>
          <Row style={{ alignItems: 'center', gap: '0.5rem' }}>
            <LogoCircleWhiteOnPurple
              style={{ height: '1rem', width: '1rem' }}
            />
            <span style={{ fontWeight: 700 }}>VxPollbook</span>
          </Row>
          <Statuses />
        </DeviceInfoBar>
        {children}
      </Main>
    </Screen>
  );
}
