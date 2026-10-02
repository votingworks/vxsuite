import React, { useEffect, useState } from 'react';
import type { PrinterStatus } from '@votingworks/types';
import type { Optional } from '@votingworks/basics';
import {
  IPP_PRINTER_STATE_REASON_MESSAGES,
  parseHighestPriorityIppPrinterStateReason,
} from './utils/printer_state_reasons.js';
import { Modal } from './modal.js';
import { Icons } from './icons.js';
import { P } from './typography.js';
import { Button } from './button.js';

function getStoppedReason(printerStatus?: PrinterStatus): Optional<string> {
  if (
    printerStatus &&
    printerStatus.connected === true &&
    printerStatus.richStatus &&
    printerStatus.richStatus.state === 'stopped'
  ) {
    const reason = parseHighestPriorityIppPrinterStateReason(
      printerStatus.richStatus.stateReasons
    );

    // There can be 'other-error' blips without a specific message, so it's not
    // worth showing.
    return reason === 'other' ? undefined : reason;
  }

  return undefined;
}

export function PrinterAlert({
  printerStatus,
}: {
  printerStatus?: PrinterStatus;
}): JSX.Element | null {
  const alertReason = getStoppedReason(printerStatus);
  const [dismissedReason, setDismissedReason] = useState<string>();

  useEffect(() => {
    if (!alertReason) {
      setDismissedReason(undefined);
    }
  }, [alertReason]);

  if (!alertReason || alertReason === dismissedReason) {
    return null;
  }

  return (
    <Modal
      title={
        <React.Fragment>
          <Icons.Warning color="warning" /> Printer Alert
        </React.Fragment>
      }
      content={<P>{IPP_PRINTER_STATE_REASON_MESSAGES[alertReason]}</P>}
      actions={
        <Button onPress={() => setDismissedReason(alertReason)}>Dismiss</Button>
      }
    />
  );
}
