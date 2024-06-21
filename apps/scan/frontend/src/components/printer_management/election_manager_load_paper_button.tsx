import React, { useState } from 'react';
import {
  Button,
  Loading,
  Modal,
  P,
  useQueryChangeListener,
} from '@votingworks/ui';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { getPrinterStatus, printTestPage } from '../../api';
import { PRINTER_FLOW_STRINGS } from '../../utils/printer';

function ElectionManagerLoadPaperModal({
  onClose,
}: {
  onClose: () => void;
}): JSX.Element {
  const printerStatusQuery = getPrinterStatus.useQuery();
  const printerStatus = printerStatusQuery.data;
  assert(printerStatus);
  assert(printerStatus.scheme === 'hardware-v4');

  const printTestPageMutation = printTestPage.useMutation();
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

  function restartFlow() {
    setHasRemovedPaperRollHolder(false);
    printTestPageMutation.reset();
  }

  // user is loading the roll and has not yet printed a test page
  if (printTestPageMutation.status === 'idle') {
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
            content={
              <P>{PRINTER_FLOW_STRINGS.paperLoadedContentElectionManager}</P>
            }
            actions={
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
          />
        );
      /* istanbul ignore next */
      default:
        throwIllegalValue(printerStatus, 'state');
    }
  }

  if (printTestPageMutation.status === 'loading') {
    return <Modal content={<Loading>Printing</Loading>} />;
  }

  assert(printTestPageMutation.status === 'success');
  const printResult = printTestPageMutation.data;

  if (printResult.isErr()) {
    const errorStatus = printResult.err();

    if (errorStatus.state === 'no-paper') {
      return (
        <Modal
          title={PRINTER_FLOW_STRINGS.testPrintNoPaperFailureTitle}
          content={<P>{PRINTER_FLOW_STRINGS.testPrintNoPaperFailureContent}</P>}
          actions={
            <React.Fragment>
              <Button variant="primary" onPress={restartFlow}>
                Retry
              </Button>
              <Button onPress={onClose}>Cancel</Button>
            </React.Fragment>
          }
        />
      );
    }

    return (
      <Modal
        title={PRINTER_FLOW_STRINGS.testPrintHardFailureTitle}
        content={<P>{PRINTER_FLOW_STRINGS.testPrintHardFailureContent}</P>}
        actions={<Button onPress={onClose}>Close</Button>}
      />
    );
  }

  return (
    <Modal
      title={PRINTER_FLOW_STRINGS.testPrintSuccessTitle}
      content={<P>{PRINTER_FLOW_STRINGS.testPrintSuccessContent}</P>}
      actions={
        <React.Fragment>
          <Button variant="primary" onPress={onClose}>
            Close
          </Button>
          <Button onPress={restartFlow}>Retry</Button>
        </React.Fragment>
      }
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
