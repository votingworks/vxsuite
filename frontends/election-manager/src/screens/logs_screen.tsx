import React, { useContext, useState } from 'react';
import { Button, Prose } from '@votingworks/ui';
import { LogFileType } from '@votingworks/utils';

import { AppContext } from '../contexts/app_context';
import { ExportLogsModal } from '../components/export_logs_modal';
import { NavigationScreen } from '../components/navigation_screen';

export function LogsScreen(): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  const [logFileType, setLogFileType] = useState<LogFileType>();

  return (
    <React.Fragment>
      <NavigationScreen>
        <Prose maxWidth={false}>
          <h1>Logs</h1>
          <p>
            <Button onPress={() => setLogFileType(LogFileType.Raw)}>
              Export Log File
            </Button>{' '}
            <Button
              disabled={!electionDefinition} // CDF requires the election to be known
              onPress={() => setLogFileType(LogFileType.Cdf)}
            >
              Export Log File as CDF
            </Button>
          </p>
        </Prose>
      </NavigationScreen>
      {logFileType && (
        <ExportLogsModal
          logFileType={logFileType}
          onClose={() => setLogFileType(undefined)}
        />
      )}
    </React.Fragment>
  );
}
