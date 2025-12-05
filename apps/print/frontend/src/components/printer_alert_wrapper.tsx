import { PrinterAlert } from '@votingworks/ui';
import { getDeviceStatuses } from '../api';

export function PrinterAlertWrapper(): JSX.Element | null {
  const deviceStatusesQuery = getDeviceStatuses.useQuery();

  if (!deviceStatusesQuery.isSuccess) {
    return null;
  }

  const { printer } = deviceStatusesQuery.data;

  return <PrinterAlert printerStatus={printer} />;
}
