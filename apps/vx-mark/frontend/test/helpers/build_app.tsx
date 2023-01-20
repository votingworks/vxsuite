import { render, RenderResult } from '@testing-library/react';
import { fakeLogger, Logger } from '@votingworks/logging';
import { Provider } from '@votingworks/types';
import { MemoryCard, MemoryHardware, MemoryStorage } from '@votingworks/utils';
import React from 'react';
import { App } from '../../src/app';
import {
  MachineConfig,
  MarkAndPrint,
  ScreenReader,
  TextToSpeech,
} from '../../src/config/types';
import { AriaScreenReader } from '../../src/utils/ScreenReader';
import { fakeMachineConfigProvider } from './fake_machine_config';
import { fakeTts } from './fake_tts';

export function buildApp(machineConfigOverrides: Partial<MachineConfig> = {}): {
  mockTts: TextToSpeech;
  screenReader: ScreenReader;
  storage: MemoryStorage;
  card: MemoryCard;
  logger: Logger;
  hardware: MemoryHardware;
  reload: () => void;
  machineConfig: Provider<MachineConfig>;
  renderApp: () => RenderResult;
} {
  const mockTts = fakeTts();
  const screenReader = new AriaScreenReader(mockTts);
  const logger = fakeLogger();
  const card = new MemoryCard();
  const hardware = MemoryHardware.build({
    connectCardReader: true,
    connectPrinter: true,
    connectAccessibleController: true,
  });
  const storage = new MemoryStorage();
  const machineConfig = fakeMachineConfigProvider({
    appMode: MarkAndPrint,
    ...machineConfigOverrides,
  });
  const reload = jest.fn();
  function renderApp() {
    return render(
      <App
        card={card}
        hardware={hardware}
        machineConfig={machineConfig}
        storage={storage}
        reload={reload}
        logger={logger}
        screenReader={screenReader}
      />
    );
  }

  return {
    mockTts,
    screenReader,
    logger,
    card,
    hardware,
    storage,
    machineConfig,
    reload,
    renderApp,
  };
}
