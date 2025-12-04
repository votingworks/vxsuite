import { PrinterAlert } from '@votingworks/ui';
import { getDeviceStatuses } from '../api';

export function PrinterAlertWrapper(): JSX.Element | null {
  console.log('rendering PrinterAlertWrapper');
  const deviceStatusesQuery = getDeviceStatuses.useQuery();

  if (!deviceStatusesQuery.isSuccess) {
    return null;
  }

  const { printer } = deviceStatusesQuery.data;

  console.log('wrapper got printer status:\n', JSON.stringify(printer));
  return <PrinterAlert printerStatus={printer} />;
}
