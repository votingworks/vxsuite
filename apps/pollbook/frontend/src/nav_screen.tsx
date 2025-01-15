import React from 'react';
import {
  AppLogo,
  getBatteryIcon,
  Icons,
  LeftNav,
  LogoCircleWhiteOnPurple,
  Main,
  MainHeader,
  Screen,
} from '@votingworks/ui';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import type { PrinterStatus } from '@votingworks/types';
import type { NetworkStatus } from '@votingworks/pollbook-backend';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import type { BatteryInfo } from '@votingworks/backend';
import { format } from '@votingworks/utils';
import { Row } from './layout';
import { getDeviceStatuses } from './api';

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
  return (
    <Row style={{ gap: '0.25rem', alignItems: 'center' }}>
      <Icons.Antenna color="inverse" />
      {status.pollbooks.length}
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
