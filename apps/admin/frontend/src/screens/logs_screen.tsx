import React, { useContext } from 'react';
import { ExportLogsButtonRow, Prose } from '@votingworks/ui';

import { AppContext } from '../contexts/app_context';
import { NavigationScreen } from '../components/navigation_screen';

export function LogsScreen(): JSX.Element {
  const { electionDefinition, usbDrive, auth, logger, machineConfig } =
    useContext(AppContext);

  return (
    <NavigationScreen title="Logs">
      <Prose maxWidth={false}>
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
