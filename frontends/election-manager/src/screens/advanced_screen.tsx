import React, { useContext, useState } from 'react';
import { Button } from '@votingworks/ui';
import { LogFileType } from '@votingworks/utils';

import { NavigationScreen } from '../components/navigation_screen';
import { Prose } from '../components/prose';
import { AppContext } from '../contexts/app_context';
import { ExportLogsModal } from '../components/export_logs_modal';

export function AdvancedScreen(): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  const [exportingLogType, setExportingLogType] = useState<LogFileType>();
  return (
    <React.Fragment>
      <NavigationScreen mainChildFlex>
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
