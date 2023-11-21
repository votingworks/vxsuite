import { useContext } from 'react';
import { ExportLogsButtonRow } from '@votingworks/ui';
import { err } from '@votingworks/basics';
import type { LogsResultType } from '@votingworks/backend';
import { exportLogsToUsb } from '../api';

import { AppContext } from '../contexts/app_context';
import { NavigationScreen } from '../components/navigation_screen';

export function LogsScreen(): JSX.Element {
  const { usbDriveStatus, auth, logger } = useContext(AppContext);

  const exportLogsToUsbMutation = exportLogsToUsb.useMutation();

  async function doExportLogs(): Promise<LogsResultType> {
    try {
      return await exportLogsToUsbMutation.mutateAsync();
    } catch (e) {
      return err('copy-failed');
    }
  }

  return (
    <NavigationScreen title="Logs">
      <ExportLogsButtonRow
        usbDriveStatus={usbDriveStatus}
        auth={auth}
        logger={logger}
        onExportLogs={doExportLogs}
      />
    </NavigationScreen>
  );
}
