import React from 'react';
import { assert } from '@votingworks/basics';
import { Button } from '@votingworks/ui';
import { getPrinterStatus, printTestPage } from '../../api';
import { PrintTestPageModal } from './print_test_page_modal';

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

  return (
    <React.Fragment>
      <Button
        onPress={() => printTestPageMutation.mutate()}
        disabled={printerStatus.state !== 'idle'}
      >
        Print Test Page
      </Button>
      <PrintTestPageModal
        printTestPageMutation={printTestPageMutation}
        onClose={resetFlow}
      />
    </React.Fragment>
  );
}
