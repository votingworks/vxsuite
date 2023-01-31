import { ColorMode } from '@votingworks/types';
import { AppBase } from '@votingworks/ui';
import {
  getHardware,
  getPrinter,
  getConverterClientType,
} from '@votingworks/utils';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import './App.css';
import { AppRoot, Props as AppRootProps } from './app_root';
import { machineConfigProvider as defaultMachineConfigProvider } from './utils/machine_config';
import { ApiClient, ApiClientContext, createApiClient } from './api';

export type Props = Partial<AppRootProps & { apiClient?: ApiClient }>;

export function App({
  hardware = getHardware(),
  printer = getPrinter(),
  machineConfigProvider = defaultMachineConfigProvider,
  converter = getConverterClientType(),
  apiClient = createApiClient(),
}: Props): JSX.Element {
  // Copied from old App.css
  const baseFontSizePx = 20;
  const printFontSizePx = 14;

  // TODO: Default to medium contrast and vary based on user selection.
  const colorMode: ColorMode = 'legacy';

  return (
    <BrowserRouter>
      <AppBase
        colorMode={colorMode}
        legacyBaseFontSizePx={baseFontSizePx}
        legacyPrintFontSizePx={printFontSizePx}
      >
        <ApiClientContext.Provider value={apiClient}>
          <AppRoot
            printer={printer}
            hardware={hardware}
            machineConfigProvider={machineConfigProvider}
            converter={converter}
          />
        </ApiClientContext.Provider>
      </AppBase>
    </BrowserRouter>
  );
}
