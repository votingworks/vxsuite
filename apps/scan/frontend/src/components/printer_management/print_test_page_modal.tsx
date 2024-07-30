import { Button, Loading, Modal, P } from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import React from 'react';
import { printTestPage } from '../../api';

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
          title="Print Failed"
          content={
            <P>
              The print stopped because paper is no longer detected in the
              printer. The paper may be misaligned. Try reloading the paper
              roll.
            </P>
          }
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
        title="Printer Error"
        content={
          <P>The printer has encountered an unexpected error while printing.</P>
        }
        actions={<Button onPress={onClose}>Close</Button>}
      />
    );
  }

  return (
    <Modal
      title="Test Page Printed"
      content={
        <P>
          Remove and inspect the test page to confirm it printed legibly. If it
          did not, try reloading the paper roll.
        </P>
      }
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
