import { PrinterAlert } from '@votingworks/ui';
import { isElectionManagerAuth } from '@votingworks/utils';
import {
  getAuthStatus,
  getPrinterStatus,
  PRINTER_STATUS_POLLING_INTERVAL_MS,
} from '../api.js';

export function PrinterAlertWrapper(): JSX.Element | null {
  // PrinterAlertWrapper is always mounted and is the single printer status
  // poller; other components subscribe without a `refetchInterval` and
  // receive updates through the shared query cache.
  const printerStatusQuery = getPrinterStatus.useQuery({
    refetchInterval: PRINTER_STATUS_POLLING_INTERVAL_MS,
  });
  const authStatusQuery = getAuthStatus.useQuery();

  const printerStatus = printerStatusQuery.data;

  // We only show alerts to election managers. We don't need to show alerts
  // when not logged in and we don't want to show alerts to system
  // administrators because they already see the same information on the
  // diagnostics page.
  if (
    !authStatusQuery.isSuccess ||
    !isElectionManagerAuth(authStatusQuery.data)
  ) {
    return null;
  }

  return <PrinterAlert printerStatus={printerStatus} />;
}
