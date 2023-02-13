import React, { useContext } from 'react';
import { ExportLogsButtonRow, Prose } from '@votingworks/shared-frontend';

import { AppContext } from '../contexts/app_context';
import { NavigationScreen } from '../components/navigation_screen';

export function LogsScreen(): JSX.Element {
  const { electionDefinition, usbDrive, auth, logger, machineConfig } =
    useContext(AppContext);

  return (
    <NavigationScreen>
      <Prose maxWidth={false}>
        <h1>Logs</h1>
        <ExportLogsButtonRow
          electionDefinition={electionDefinition}
          usbDriveStatus={usbDrive.status}
          auth={auth}
          logger={logger}
          machineConfig={machineConfig}
        />
      </Prose>
    </NavigationScreen>
  );
}
