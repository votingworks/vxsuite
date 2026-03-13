import { PrintTestPageButton as SharedPrintTestPageButton } from '@votingworks/ui';
import { addDiagnosticRecord, getPrinterStatus, printTestPage } from '../api';

export { TEST_PAGE_PRINT_DELAY_SECONDS } from '@votingworks/ui';

export function PrintTestPageButton(): JSX.Element {
  const isPrinterConnected =
    getPrinterStatus.useQuery().data?.connected ?? false;
  const printTestPageMutation = printTestPage.useMutation();
  const addDiagnosticRecordMutation = addDiagnosticRecord.useMutation();

  return (
    <SharedPrintTestPageButton
      isPrinterConnected={isPrinterConnected}
      printTestPage={() => printTestPageMutation.mutate()}
      logTestPrintOutcome={(input) =>
        addDiagnosticRecordMutation.mutate({ type: 'test-print', ...input })
      }
    />
  );
}
