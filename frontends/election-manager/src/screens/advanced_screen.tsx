import React, { useContext, useState } from 'react';
import {
  Button,
  CurrentDateAndTime,
  SetClockButton,
  Prose,
} from '@votingworks/ui';
import { LogFileType } from '@votingworks/utils';

import { NavigationScreen } from '../components/navigation_screen';
import { AppContext } from '../contexts/app_context';
import { ExportLogsModal } from '../components/export_logs_modal';

export function AdvancedScreen(): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  const [exportingLogType, setExportingLogType] = useState<LogFileType>();
  return (
    <React.Fragment>
      <NavigationScreen>
        <Prose maxWidth={false}>
          <h1>Advanced Options</h1>
          <h2>Logs</h2>
          <Button onPress={() => setExportingLogType(LogFileType.Raw)}>
            Export Log File
          </Button>{' '}
          <Button
            onPress={() => setExportingLogType(LogFileType.Cdf)}
            disabled={electionDefinition === undefined} // CDF requires the election being known.
          >
            Export Log File as CDF
          </Button>
          <h2>Current Date and Time</h2>
          <p>
            <CurrentDateAndTime />
          </p>
          <p>
            <SetClockButton>Update Date and Time</SetClockButton>
          </p>
        </Prose>
      </NavigationScreen>
      {exportingLogType !== undefined && (
        <ExportLogsModal
          onClose={() => setExportingLogType(undefined)}
          logFileType={exportingLogType}
        />
      )}
    </React.Fragment>
  );
}
