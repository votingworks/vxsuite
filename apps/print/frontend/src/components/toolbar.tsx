import { useHistory } from 'react-router-dom';
import styled from 'styled-components';

import {
  BatteryStatus,
  Button,
  Caption,
  DateTimeDisplay,
  type IconName,
  Icons,
  LockMachineButton,
  ToolbarButtons,
  Toolbar as ToolbarContainer,
  getBlockingPrinterStateReason,
} from '@votingworks/ui';
import type { UsbDriveStatus } from '@votingworks/usb-drive';

import type {
  IppPrinterStateReason,
  PrinterStatus as PrinterStatusType,
} from '@votingworks/types';
import { ejectUsbDrive, getDeviceStatuses, logOut } from '../api.js';

// The printer is set to default to 2%, but we warn at 5%
// to be extra careful about low toner making ballots unscannable
const LOW_TONER_LEVEL = 5;

export const BLOCKING_PRINTER_STATE_REASON_LABELS: Readonly<
  Record<IppPrinterStateReason, string>
> = {
  'cover-open': 'Cover Open',
  'door-open': 'Door Open',
  'input-tray-missing': 'Input Tray Missing',
  'interlock-open': 'Door Open',
  'marker-supply-empty': 'No Toner',
  // `media-empty` status is reported when there is no paper and when paper tray is open
  'media-empty': 'No Paper',
  'media-jam': 'Paper Jam',
  'media-needed': 'No Paper',
  'output-area-full': 'Output Bin Full',
  'spool-area-full': 'Output Bin Full',
  'toner-empty': 'No Toner',
};

const Row = styled.div`
  display: flex;
  flex-direction: row;
`;

const ToolbarButton = styled(Button)`
  font-size: 0.8rem;
  padding: 0.25rem 0.75rem;
`;

const StatusCaption = styled(Caption)`
  font-size: 0.8rem;
  font-weight: 500;
`;

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
      {labelText && <StatusCaption>{labelText}</StatusCaption>}
    </Row>
  );
}

function PrinterConnectionStatus({ connected }: { connected: boolean }) {
  if (connected) {
    return <BasePrinterStatus />;
  }

  return (
    <BasePrinterStatus
      icon={<Icons.Warning color="inverseWarning" />}
      labelText="Not Connected"
    />
  );
}

function PrinterStatus({ status }: { status: PrinterStatusType }) {
  const { connected } = status;
  if (!connected || !status.richStatus) {
    return <PrinterConnectionStatus connected={connected} />;
  }

  const blockingReason = getBlockingPrinterStateReason(status);
  if (blockingReason) {
    return (
      <BasePrinterStatus
        icon={<Icons.Warning color="inverseWarning" />}
        labelText={
          BLOCKING_PRINTER_STATE_REASON_LABELS[blockingReason] ??
          // @coverage-exclude: every blocking reason has a label enforced by toolbar.test.ts
          'See Printer Display'
        }
      />
    );
  }

  // @coverage-defer
  const { richStatus } = status;

  // @coverage-defer
  if (richStatus.state === 'stopped') {
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

  // @coverage-defer
  const cartridgeMarkerInfo = richStatus.markerInfos.find(
    (markerInfo) =>
      markerInfo.type === 'toner-cartridge' &&
      markerInfo.name === 'black cartridge'
  );
  // @coverage-defer
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

  // @coverage-defer
  return <PrinterConnectionStatus connected={connected} />;
}

type ExtendedUsbDriveStatus = UsbDriveStatus['status'] | 'ejecting';
const BUTTON_ICON_AND_TEXT: Record<ExtendedUsbDriveStatus, [IconName, string]> =
  {
    no_drive: ['Disabled', 'No USB'],
    error: ['Disabled', 'No USB'],
    mounted: ['Eject', 'Eject USB'],
    ejecting: ['Eject', 'Ejecting...'],
    ejected: ['Disabled', 'USB Ejected'],
  };

function UsbControllerButton({ status }: { status: UsbDriveStatus }) {
  const ejectUsbMutation = ejectUsbDrive.useMutation();
  const isEjecting = ejectUsbMutation.isLoading;
  // @coverage-defer
  const extendedUsbDriveStatus: ExtendedUsbDriveStatus = isEjecting
    ? 'ejecting'
    : status.status;
  const [icon, text] = BUTTON_ICON_AND_TEXT[extendedUsbDriveStatus];
  return (
    <Row style={{ gap: '0.25rem', alignItems: 'center' }}>
      <ToolbarButton
        icon={icon}
        // @coverage-defer
        onPress={() => ejectUsbMutation.mutate()}
        color="inverseNeutral"
        // @coverage-defer
        disabled={extendedUsbDriveStatus !== 'mounted' || isEjecting}
      >
        {text}
      </ToolbarButton>
    </Row>
  );
}

export function Toolbar(): JSX.Element {
  const getDeviceStatusesQuery = getDeviceStatuses.useQuery();
  const logOutMutation = logOut.useMutation();
  const history = useHistory();

  // @coverage-defer
  function handleLock() {
    logOutMutation.mutate(undefined, {
      onSuccess: () => {
        history.replace('/');
      },
    });
  }

  // @coverage-defer
  if (!getDeviceStatusesQuery.isSuccess) {
    return (
      <ToolbarContainer>
        <LockMachineButton onLock={handleLock} />
      </ToolbarContainer>
    );
  }

  const { usbDrive, printer, battery } = getDeviceStatusesQuery.data;

  return (
    <ToolbarContainer>
      <PrinterStatus status={printer} />
      {battery && <BatteryStatus batteryInfo={battery} />}
      <DateTimeDisplay />
      <ToolbarButtons>
        <UsbControllerButton status={usbDrive} />
        <LockMachineButton onLock={handleLock} />
      </ToolbarButtons>
    </ToolbarContainer>
  );
}
