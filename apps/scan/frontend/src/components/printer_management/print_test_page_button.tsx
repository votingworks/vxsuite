import React from 'react';
import { assert } from '@votingworks/basics';
import { Button, Loading, Modal, P } from '@votingworks/ui';
import { getPrinterStatus, printTestPage } from '../../api';
import { PRINTER_FLOW_STRINGS } from '../../utils/printer';

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
            title={PRINTER_FLOW_STRINGS.testPrintNoPaperFailureTitle}
            content={
              <P>{PRINTER_FLOW_STRINGS.testPrintNoPaperFailureContent}</P>
            }
            actions={<Button onPress={resetFlow}>Close</Button>}
          />
        );
      }

      return (
        <Modal
          title={PRINTER_FLOW_STRINGS.testPrintHardFailureTitle}
          content={<P>{PRINTER_FLOW_STRINGS.testPrintHardFailureContent}</P>}
          actions={<Button onPress={resetFlow}>Close</Button>}
        />
      );
    }

    return (
      <Modal
        title={PRINTER_FLOW_STRINGS.testPrintSuccessTitle}
        content={<P>{PRINTER_FLOW_STRINGS.testPrintSuccessContent}</P>}
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
