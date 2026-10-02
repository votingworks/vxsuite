// @coverage-defer-file
import { PrintTestPageButton as SharedPrintTestPageButton } from '@votingworks/ui';
import {
  addDiagnosticRecord,
  getDeviceStatuses,
  printTestPage,
} from '../api.js';
import { isPrinterReady } from '../utils.js';

export { TEST_PAGE_PRINT_DELAY_SECONDS } from '@votingworks/ui';

export function PrintTestPageButton(): JSX.Element {
  const deviceStatusesQuery = getDeviceStatuses.useQuery();
  const printer = deviceStatusesQuery.data?.printer;
  const printTestPageMutation = printTestPage.useMutation();
  const addDiagnosticRecordMutation = addDiagnosticRecord.useMutation();

  return (
    <SharedPrintTestPageButton
      isPrinterReady={printer ? isPrinterReady(printer) : false}
      printTestPage={() => printTestPageMutation.mutate()}
      logTestPrintOutcome={(input) =>
        addDiagnosticRecordMutation.mutate({ type: 'test-print', ...input })
      }
    />
  );
}
