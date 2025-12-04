import React, { useEffect, useState } from 'react';
import { PrinterRichStatus, PrinterStatus } from '@votingworks/types';
import {
  IPP_PRINTER_STATE_REASON_MESSAGES,
  parseHighestPriorityIppPrinterStateReason,
} from './diagnostics';
import { Modal } from './modal';
import { Icons } from './icons';
import { P } from './typography';
import { Button } from './button';

// TODO handle election manager or {election manager, poll worker} gating in the caller
export function PrinterAlert({
  printerStatus,
}: {
  printerStatus?: PrinterStatus;
}): JSX.Element | null {
  const [alertStatus, setAlertStatus] = useState<PrinterRichStatus>();

  useEffect(() => {
    if (
      printerStatus &&
      printerStatus.connected === true &&
      printerStatus.richStatus &&
      printerStatus.richStatus.state === 'stopped'
    ) {
      setAlertStatus(printerStatus.richStatus);
    } else {
      setAlertStatus(undefined);
    }
  }, [printerStatus]);

  if (!alertStatus) {
    return null;
  }

  const stoppedReason = parseHighestPriorityIppPrinterStateReason(
    alertStatus.stateReasons
  );

  // There can be 'other-error' blips without a specific message, so it's not
  // worth showing.
  if (!stoppedReason || stoppedReason === 'other') {
    return null;
  }

  return (
    <Modal
      title={
        <React.Fragment>
          <Icons.Warning color="warning" /> Printer Alert
        </React.Fragment>
      }
      content={<P>{IPP_PRINTER_STATE_REASON_MESSAGES[stoppedReason]}</P>}
      actions={
        <Button onPress={() => setAlertStatus(undefined)}>Dismiss</Button>
      }
    />
  );
}
