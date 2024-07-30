import { assert, throwIllegalValue } from '@votingworks/basics';
import React, { useState } from 'react';
import { Button, Modal, P, useQueryChangeListener } from '@votingworks/ui';
import { getPrinterStatus } from '../../api';
import { PRINTER_FLOW_STRINGS } from '../../utils/printer';

export interface LoadPaperModalProps {
  postLoadPaperInstructions: string;
  postLoadPaperActions: React.ReactNode;
  onClose: () => void;
}

export function LoadPaperModal({
  postLoadPaperInstructions,
  postLoadPaperActions,
  onClose,
}: LoadPaperModalProps): JSX.Element {
  const printerStatusQuery = getPrinterStatus.useQuery();
  const printerStatus = printerStatusQuery.data;
  assert(printerStatus);
  assert(printerStatus.scheme === 'hardware-v4');

  const [hasRemovedPaperRollHolder, setHasRemovedPaperRollHolder] = useState(
    printerStatus.state === 'cover-open'
  );

  // advance the user flow when we detect the printer was opened
  useQueryChangeListener(printerStatusQuery, {
    onChange: (newPrinterStatus) => {
      assert(newPrinterStatus.scheme === 'hardware-v4');
      if (newPrinterStatus.state === 'cover-open') {
        setHasRemovedPaperRollHolder(true);
      }
    },
  });

  // user has not yet removed the paper roll holder
  if (!hasRemovedPaperRollHolder) {
    // we shouldn't need to handle errors in this initial state, because the
    // modal shouldn't be open-able if the printer is in an error state
    return (
      <Modal
        title={PRINTER_FLOW_STRINGS.removePaperRollHolderTitle}
        content={<P>{PRINTER_FLOW_STRINGS.removePaperRollHolderContent}</P>}
        actions={<Button onPress={onClose}>Cancel</Button>}
      />
    );
  }

  // user has removed the paper roll holder, we guide them through reloading the paper
  switch (printerStatus.state) {
    case 'error':
      return (
        <Modal
          title={PRINTER_FLOW_STRINGS.prePrintErrorTitle}
          content={<P>{PRINTER_FLOW_STRINGS.prePrintErrorContent}</P>}
          actions={<Button onPress={onClose}>Close</Button>}
        />
      );
    case 'cover-open':
      return (
        <Modal
          title={PRINTER_FLOW_STRINGS.loadNewPaperRollTitle}
          content={<P>{PRINTER_FLOW_STRINGS.loadNewPaperRollContent}</P>}
          actions={<Button onPress={onClose}>Cancel</Button>}
        />
      );
    case 'no-paper':
      return (
        <Modal
          title={PRINTER_FLOW_STRINGS.noPaperDetectedAfterReloadTitle}
          content={
            <P>{PRINTER_FLOW_STRINGS.noPaperDetectedAfterReloadContent}</P>
          }
          actions={<Button onPress={onClose}>Cancel</Button>}
        />
      );

    case 'idle':
      return (
        <Modal
          title={PRINTER_FLOW_STRINGS.paperLoadedTitle}
          content={<P>{postLoadPaperInstructions}</P>}
          actions={postLoadPaperActions}
        />
      );
    /* istanbul ignore next */
    default:
      throwIllegalValue(printerStatus, 'state');
  }
}
