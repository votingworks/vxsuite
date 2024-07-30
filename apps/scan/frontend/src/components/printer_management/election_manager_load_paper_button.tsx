import React, { useState } from 'react';
import { Button } from '@votingworks/ui';
import { getPrinterStatus, printTestPage } from '../../api';
import { PRINTER_FLOW_STRINGS } from '../../utils/printer';
import { PrintTestPageModal } from './print_test_page_modal';
import { LoadPaperModal } from './load_paper_modal';

function ElectionManagerLoadPaperModal({
  onClose,
}: {
  onClose: () => void;
}): JSX.Element {
  const printTestPageMutation = printTestPage.useMutation();

  function restartFlow() {
    printTestPageMutation.reset();
  }

  // user has not yet printed a test page, so they are in the loading flow
  if (printTestPageMutation.status === 'idle') {
    return (
      <LoadPaperModal
        postLoadPaperInstructions={
          PRINTER_FLOW_STRINGS.paperLoadedContentElectionManager
        }
        postLoadPaperActions={
          <React.Fragment>
            <Button
              variant="primary"
              onPress={() => printTestPageMutation.mutate()}
            >
              Continue
            </Button>
            <Button onPress={onClose}>Cancel</Button>
          </React.Fragment>
        }
        onClose={onClose}
      />
    );
  }

  return (
    <PrintTestPageModal
      printTestPageMutation={printTestPageMutation}
      onClose={onClose}
      onRetry={restartFlow}
    />
  );
}

export interface ElectionManagerLoadPaperButtonProps {
  isPrimary: boolean;
}

export function ElectionManagerLoadPaperButton({
  isPrimary,
}: ElectionManagerLoadPaperButtonProps): JSX.Element {
  const printerStatusQuery = getPrinterStatus.useQuery();
  const [isLoadPaperModalOpen, setIsLoadPaperModalOpen] = useState(false);

  const enabled =
    printerStatusQuery.isSuccess &&
    printerStatusQuery.data.scheme === 'hardware-v4' &&
    printerStatusQuery.data.state !== 'error';

  return (
    <React.Fragment>
      <Button
        variant={isPrimary ? 'primary' : undefined}
        onPress={() => setIsLoadPaperModalOpen(true)}
        disabled={!enabled}
      >
        Load Paper
      </Button>
      {isLoadPaperModalOpen && (
        <ElectionManagerLoadPaperModal
          onClose={() => setIsLoadPaperModalOpen(false)}
        />
      )}
    </React.Fragment>
  );
}
