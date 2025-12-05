import { useState, useEffect } from 'react';
import styled from 'styled-components';

import { Button, Caption, Icons } from '@votingworks/ui';
import { format } from '@votingworks/utils';
import { UsbDriveStatus } from '@votingworks/usb-drive';

import { type PrinterStatus as PrinterStatusType } from '@votingworks/types';
import { getDeviceStatuses, logOut } from '../api';

// The printer is set to default to 2%, but we warn at 5%
// to be extra careful about low toner making ballots unscannable
const LOW_TONER_LEVEL = 5;

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

function BasePrinterStatus({
  icon,
  labelText,
}: {
  icon?: JSX.Element;
  labelText?: string;
}) {
  return (
    <Row style={{ gap: '0.25rem', justifyContent: 'end' }}>
      <Icons.Print color="inverse" />
      {icon}
      {labelText && <Caption>{labelText}</Caption>}
    </Row>
  );
}

function PrinterConnectionStatus({ connected }: { connected: boolean }) {
  if (connected) {
    return <BasePrinterStatus />;
  }

  return (
    <BasePrinterStatus
      icon={<Icons.Disabled color="inverseWarning" />}
      labelText="Not Connected"
    />
  );
}

function PrinterStatus({ status }: { status: PrinterStatusType }) {
  const { connected } = status;
  if (!connected || !status.richStatus) {
    return <PrinterConnectionStatus connected={connected} />;
  }

  const { richStatus } = status;

  if (richStatus.state === 'stopped') {
    if (
      richStatus.stateReasons.find((reason) => reason === 'media-empty-error')
    ) {
      // No paper and paper tray open both return the same error, so we can't
      // differentiate the error message
      return (
        <BasePrinterStatus
          icon={<Icons.Warning color="inverseWarning" />}
          labelText="No Paper"
        />
      );
    }

    if (
      richStatus.stateReasons.find((reason) => reason === 'media-jam-error')
    ) {
      return (
        <BasePrinterStatus
          icon={<Icons.Warning color="inverseWarning" />}
          labelText="Paper Jam"
        />
      );
    }

    // Printer output bin is obstructed
    if (
      richStatus.stateReasons.find(
        (reason) =>
          reason === 'spool-area-full' || reason === 'spool-area-full-report'
      )
    ) {
      return (
        <BasePrinterStatus
          icon={<Icons.Warning color="inverseWarning" />}
          labelText="Output Bin Full"
        />
      );
    }

    // Encountered when a jam on the 1st of 2 pages resulted in a subtle jam entirely
    // inside the printer. The printer screen readout was helpful in this case, but
    // due to the vagueness of 'other-error' our user-facing error should be vague as well
    if (richStatus.stateReasons.find((reason) => reason === 'other-error')) {
      return (
        <BasePrinterStatus
          icon={<Icons.Warning color="inverseWarning" />}
          labelText="See Printer Display"
        />
      );
    }

    return (
      <BasePrinterStatus
        icon={<Icons.Warning color="inverseWarning" />}
        labelText="Unknown Error"
      />
    );
  }

  const cartridgeMarkerInfo = richStatus.markerInfos.find(
    (markerInfo) =>
      markerInfo.type === 'toner-cartridge' &&
      markerInfo.name === 'black cartridge'
  );
  if (
    cartridgeMarkerInfo?.level &&
    cartridgeMarkerInfo.level <= LOW_TONER_LEVEL
  ) {
    return (
      <BasePrinterStatus
        icon={<Icons.Warning color="inverseWarning" />}
        labelText="Low Toner"
      />
    );
  }

  return <PrinterConnectionStatus connected={connected} />;
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
  if (!getDeviceStatusesQuery.isSuccess) {
    return null;
  }

  const { usbDrive, printer } = getDeviceStatusesQuery.data;

  return (
    <ToolbarContainer>
      <PrinterStatus status={printer} />
      <UsbStatus status={usbDrive} />
      {format.clockDateAndTime(currentDate)}
      <LogOutButton />
    </ToolbarContainer>
  );
}
