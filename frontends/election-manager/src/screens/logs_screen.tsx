import React, { useContext } from 'react';
import { ExportLogsButtonRow, Prose } from '@votingworks/ui';

import { AppContext } from '../contexts/app_context';
import { NavigationScreen } from '../components/navigation_screen';

export function LogsScreen(): JSX.Element {
  const { electionDefinition, usbDriveStatus, auth, logger, machineConfig } =
    useContext(AppContext);

  return (
    <NavigationScreen>
      <Prose maxWidth={false}>
        <h1>Logs</h1>
        <ExportLogsButtonRow
          electionDefinition={electionDefinition}
          usbDriveStatus={usbDriveStatus}
          auth={auth}
          logger={logger}
          machineConfig={machineConfig}
        />
      </Prose>
    </NavigationScreen>
  );
}
