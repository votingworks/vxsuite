import { Button, Loading, Modal, P } from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import React from 'react';
import { printTestPage } from '../../api';
import { PRINTER_FLOW_STRINGS } from '../../utils/printer';

export interface PrintTestPageModalProps {
  printTestPageMutation: ReturnType<typeof printTestPage.useMutation>;
  onClose: () => void;
  onRetry?: () => void;
}

export function PrintTestPageModal({
  printTestPageMutation,
  onClose,
  onRetry,
}: PrintTestPageModalProps): JSX.Element | null {
  if (printTestPageMutation.status === 'idle') {
    return null;
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
              {onRetry && (
                <Button variant="primary" onPress={onRetry}>
                  Retry
                </Button>
              )}
              <Button onPress={onClose}>Close</Button>
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
          {onRetry && <Button onPress={onRetry}>Retry</Button>}
        </React.Fragment>
      }
    />
  );
}
