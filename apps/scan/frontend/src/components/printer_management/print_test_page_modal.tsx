import { Button, Loading, Modal, P } from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import React from 'react';
import { logTestPrintOutcome, printTestPage } from '../../api';

export interface PrintTestPageModalProps {
  printTestPageMutation: ReturnType<typeof printTestPage.useMutation>;
  onClose: () => void;
  onRetry?: () => void;
}

export function PrintTestPageModal({
  printTestPageMutation,
  onClose: onCloseFromProps,
  onRetry: onRetryFromProps,
}: PrintTestPageModalProps): JSX.Element | null {
  const logTestPrintOutcomeMutation = logTestPrintOutcome.useMutation();

  function onClose() {
    logTestPrintOutcomeMutation.reset();
    onCloseFromProps();
  }

  const onRetry = onRetryFromProps
    ? () => {
        logTestPrintOutcomeMutation.reset();
        onRetryFromProps();
      }
    : undefined;

  function logPass() {
    logTestPrintOutcomeMutation.mutate({ outcome: 'pass' });
    onClose();
  }

  function logFail() {
    logTestPrintOutcomeMutation.mutate({ outcome: 'fail' });
  }

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

  if (
    logTestPrintOutcomeMutation.status === 'idle' ||
    logTestPrintOutcomeMutation.status === 'loading'
  ) {
    return (
      <Modal
        title="Test Page Printed"
        content={<P>Remove and inspect the test page. Did it print legibly?</P>}
        actions={
          <React.Fragment>
            <Button variant="primary" onPress={logPass}>
              Yes
            </Button>
            <Button onPress={logFail}>No</Button>
          </React.Fragment>
        }
      />
    );
  }

  return (
    <Modal
      title="Test Page Printed"
      content={
        <P>
          You indicated the test print was not successful. The paper may not be
          loaded correctly. Please try reloading the paper and attempt the test
          print again.
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
