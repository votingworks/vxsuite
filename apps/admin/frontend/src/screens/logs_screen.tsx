import { useContext } from 'react';
import { ExportLogsButtonRow } from '@votingworks/ui';

import { AppContext } from '../contexts/app_context';
import { NavigationScreen } from '../components/navigation_screen';
import { legacyUsbDriveStatus } from '../api';

export function LogsScreen(): JSX.Element {
  const { electionDefinition, usbDriveStatus, auth, logger, machineConfig } =
    useContext(AppContext);

  return (
    <NavigationScreen title="Logs">
      <ExportLogsButtonRow
        electionDefinition={electionDefinition}
        usbDriveStatus={legacyUsbDriveStatus(usbDriveStatus)}
        auth={auth}
        logger={logger}
        machineConfig={machineConfig}
      />
    </NavigationScreen>
  );
}
