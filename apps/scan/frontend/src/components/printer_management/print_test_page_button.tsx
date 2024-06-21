import React from 'react';
import { assert } from '@votingworks/basics';
import { Button, Loading, Modal, P } from '@votingworks/ui';
import { getPrinterStatus, printTestPage } from '../../api';

export function PrintTestPageButton(): JSX.Element | null {
  const printerStatusQuery = getPrinterStatus.useQuery();
  const printTestPageMutation = printTestPage.useMutation();

  function resetFlow() {
    printTestPageMutation.reset();
  }

  if (!printerStatusQuery.isSuccess) {
    return null;
  }

  const printerStatus = printerStatusQuery.data;
  assert(printerStatus.scheme === 'hardware-v4');

  const modal: JSX.Element | null = (() => {
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
            actions={<Button onPress={resetFlow}>Close</Button>}
          />
        );
      }

      return (
        <Modal
          title="Printer Error"
          content={
            <P>
              The printer has encountered an unexpected error while printing.
            </P>
          }
          actions={<Button onPress={resetFlow}>Close</Button>}
        />
      );
    }

    return (
      <Modal
        title="Test Page Printed"
        content={
          <P>
            Remove and inspect the test page to confirm it printed legibly. If
            it did not, try reloading the paper.
          </P>
        }
        actions={
          <Button variant="primary" onPress={resetFlow}>
            Close
          </Button>
        }
      />
    );
  })();

  return (
    <React.Fragment>
      <Button
        onPress={() => printTestPageMutation.mutate()}
        disabled={printerStatus.state !== 'idle'}
      >
        Print Test Page
      </Button>
      {modal}
    </React.Fragment>
  );
}
