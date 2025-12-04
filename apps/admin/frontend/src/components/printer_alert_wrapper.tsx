import { PrinterAlert } from '@votingworks/ui';
import { isElectionManagerAuth } from '@votingworks/utils';
import { getAuthStatus, getPrinterStatus } from '../api';

export function PrinterAlertWrapper(): JSX.Element | null {
  const printerStatusQuery = getPrinterStatus.useQuery();
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
