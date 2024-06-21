import React, { useState } from 'react';
import { Button, Modal, P, useQueryChangeListener } from '@votingworks/ui';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { getPrinterStatus } from '../../api';

function PollWorkerLoadPaperModal({
  onClose,
}: {
  onClose: () => void;
}): JSX.Element {
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
        title="Remove Paper Roll Holder"
        content={
          <P>
            Open the access door to reveal the printer. Press the green lever on
            the paper roll holder to separate it from the printer.
          </P>
        }
        actions={<Button onPress={onClose}>Cancel</Button>}
      />
    );
  }

  // user has removed the paper roll holder, we guide them through reloading the paper
  switch (printerStatus.state) {
    case 'error':
      return (
        <Modal
          title="Printer Error"
          content={<P>The printer has encountered an unexpected error.</P>}
          actions={<Button onPress={onClose}>Close</Button>}
        />
      );
    case 'cover-open':
      return (
        <Modal
          title="Load New Paper Roll"
          content={
            <P>
              Slide a new roll of paper onto the roll holder. Unroll enough
              paper to pull it over the tear bar and toward you. Holding the end
              of the paper with your thumbs, push the roll holder back onto the
              printer so it clicks into place.
            </P>
          }
          actions={<Button onPress={onClose}>Cancel</Button>}
        />
      );
    case 'no-paper':
      return (
        <Modal
          title="No Paper Detected"
          content={
            <P>
              The paper roll holder was reattached but no paper is detected. It
              may not be loaded correctly. Try to remove the roll holder and
              load the paper again.
            </P>
          }
          actions={<Button onPress={onClose}>Cancel</Button>}
        />
      );

    case 'idle':
      return (
        <Modal
          title="Paper Loaded"
          content={
            <P>Paper is now loaded and you may continue printing reports.</P>
          }
          actions={
            <Button variant="primary" onPress={onClose}>
              Close
            </Button>
          }
        />
      );
    /* istanbul ignore next */
    default:
      throwIllegalValue(printerStatus, 'state');
  }
}

export interface PollWorkerLoadAndReprintButtonProps {
  reprint: () => void;
  reprintText: string;
  disablePrinting?: boolean;
  loadPaperText?: string;
}

/**
 * Within the poll worker UX, there may be points where the poll worker needs
 * to reprint a report but can only do so if the printer has paper loaded. This
 * component provides a button that will either prompt the user to load paper
 * or reprint the report, depending on the printer's current state.
 */
export function PollWorkerLoadAndReprintButton({
  reprint,
  reprintText,
  disablePrinting,
  loadPaperText = 'Load Paper',
}: PollWorkerLoadAndReprintButtonProps): JSX.Element {
  const printerStatusQuery = getPrinterStatus.useQuery();
  const [isLoadPaperModalOpen, setIsLoadPaperModalOpen] = useState(false);

  if (!printerStatusQuery.isSuccess) {
    return (
      <Button disabled onPress={reprint}>
        {reprintText}
      </Button>
    );
  }

  const printerStatus = printerStatusQuery.data;
  assert(printerStatus.scheme === 'hardware-v4');

  const showLoadPaperButton =
    printerStatus.state === 'no-paper' || printerStatus.state === 'cover-open';

  return (
    <React.Fragment>
      {showLoadPaperButton ? (
        <Button onPress={() => setIsLoadPaperModalOpen(true)}>
          {loadPaperText}
        </Button>
      ) : (
        <Button
          disabled={disablePrinting || printerStatus.state === 'error'} // we can't print or reload in an error state
          onPress={reprint}
        >
          {reprintText}
        </Button>
      )}
      {isLoadPaperModalOpen && (
        <PollWorkerLoadPaperModal
          onClose={() => setIsLoadPaperModalOpen(false)}
        />
      )}
    </React.Fragment>
  );
}
