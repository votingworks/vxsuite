import { Logger, LogSource } from '@votingworks/logging';
import { getHardware, getPrinter, WebServiceCard } from '@votingworks/utils';
import React, { useMemo } from 'react';
import { BrowserRouter } from 'react-router-dom';
import './App.css';
import { AppRoot, Props as AppRootProps } from './app_root';
import { getConverterClientType } from './config/features';
import { ElectionManagerStoreBackend } from './lib/backends';
import { machineConfigProvider as defaultMachineConfigProvider } from './utils/machine_config';

export interface Props extends Partial<AppRootProps> {
  backend: ElectionManagerStoreBackend;
}

export function App({
  backend,
  logger: loggerProp,
  hardware = getHardware(),
  card = new WebServiceCard(),
  printer = getPrinter(),
  machineConfigProvider = defaultMachineConfigProvider,
  converter = getConverterClientType(),
}: Props): JSX.Element {
  const logger = useMemo(
    () => loggerProp ?? new Logger(LogSource.VxAdminFrontend, window.kiosk),
    [loggerProp]
  );

  return (
    <BrowserRouter>
      <AppRoot
        logger={logger}
        backend={backend}
        printer={printer}
        hardware={hardware}
        card={card}
        machineConfigProvider={machineConfigProvider}
        converter={converter}
      />
    </BrowserRouter>
  );
}
