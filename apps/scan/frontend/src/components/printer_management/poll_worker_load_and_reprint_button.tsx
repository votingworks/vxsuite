import React, { useState } from 'react';
import { Button } from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import { getPrinterStatus } from '../../api';
import { LoadPaperModal } from './load_paper_modal';

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
        <LoadPaperModal
          postLoadPaperInstructions="Paper is now loaded. You may continue printing reports."
          postLoadPaperActions={
            <Button
              variant="primary"
              onPress={() => setIsLoadPaperModalOpen(false)}
            >
              Close
            </Button>
          }
          onClose={() => setIsLoadPaperModalOpen(false)}
        />
      )}
    </React.Fragment>
  );
}
