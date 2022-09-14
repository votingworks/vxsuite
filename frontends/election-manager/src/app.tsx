import { getHardware, getPrinter, WebServiceCard } from '@votingworks/utils';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import './App.css';
import { AppRoot, Props as AppRootProps } from './app_root';
import { getConverterClientType } from './config/features';
import { machineConfigProvider as defaultMachineConfigProvider } from './utils/machine_config';

export type Props = Partial<AppRootProps>;

export function App({
  hardware = getHardware(),
  card = new WebServiceCard(),
  printer = getPrinter(),
  machineConfigProvider = defaultMachineConfigProvider,
  converter = getConverterClientType(),
}: Props): JSX.Element {
  return (
    <BrowserRouter>
      <AppRoot
        printer={printer}
        hardware={hardware}
        card={card}
        machineConfigProvider={machineConfigProvider}
        converter={converter}
      />
    </BrowserRouter>
  );
}
