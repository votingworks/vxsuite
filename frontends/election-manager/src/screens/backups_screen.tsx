import React, { useContext, useState } from 'react';
import { Button, Prose } from '@votingworks/ui';
import { LogFileType } from '@votingworks/utils';

import { AppContext } from '../contexts/app_context';
import { ExportLogsModal } from '../components/export_logs_modal';
import { NavigationScreen } from '../components/navigation_screen';

export function BackupsScreen(): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  const [logFileType, setLogFileType] = useState<LogFileType>();

  return (
    <React.Fragment>
      <NavigationScreen>
        <Prose maxWidth={false}>
          <h1>Backups</h1>
          <Button onPress={() => setLogFileType(LogFileType.Raw)}>
            Back Up Log File
          </Button>{' '}
          <Button
            disabled={!electionDefinition} // CDF requires the election to be known
            onPress={() => setLogFileType(LogFileType.Cdf)}
          >
            Back Up Log File as CDF
          </Button>
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
