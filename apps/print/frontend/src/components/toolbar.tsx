import { useState, useEffect } from 'react';
import styled from 'styled-components';

import { Button, Icons } from '@votingworks/ui';
import { format } from '@votingworks/utils';
import { UsbDriveStatus } from '@votingworks/usb-drive';

import type { PrinterStatus as PrinterStatusType } from '@votingworks/types';
import { getDeviceStatuses, logOut } from '../api';

const Row = styled.div`
  display: flex;
  flex-direction: row;
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

function PrinterStatus({ status }: { status: PrinterStatusType }) {
  return (
    <Row style={{ gap: '0.25rem', alignItems: 'center' }}>
      <Icons.Print color="inverse" />
      {!status.connected && <Icons.Warning color="inverseWarning" />}
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

function LogOutButton(): JSX.Element {
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

const ToolbarContainer = styled(Row)`
  position: sticky;
  top: 0;
  width: 100%;
  height: 2.2rem;
  gap: 1.25rem;
  justify-content: flex-end;
  align-items: center;
  background: ${(p) => p.theme.colors.inverseContainer};
  color: ${(p) => p.theme.colors.onInverse};
  padding: 0.25rem 1rem;
`;

export function Toolbar(): JSX.Element | null {
  const currentDate = useCurrentDate();

  const getDeviceStatusesQuery = getDeviceStatuses.useQuery();

  const { usbDrive, printer } = getDeviceStatusesQuery.data ?? {
    usbDrive: { status: 'no_drive' },
    printer: { connected: false },
  };

  return (
    <ToolbarContainer>
      {format.clockDateAndTime(currentDate)}
      <UsbStatus status={usbDrive} />
      <PrinterStatus status={printer} />
      <LogOutButton />
    </ToolbarContainer>
  );
}
