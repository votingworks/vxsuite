import { render, RenderResult } from '@testing-library/react';
import { fakeLogger, Logger } from '@votingworks/logging';
import { MemoryCard, MemoryHardware, MemoryStorage } from '@votingworks/utils';
import React from 'react';
import { App } from '../../src/app';
import { ScreenReader, TextToSpeech } from '../../src/config/types';
import { AriaScreenReader } from '../../src/utils/ScreenReader';
import { fakeTts } from './fake_tts';

export function buildApp(): {
  mockTts: TextToSpeech;
  screenReader: ScreenReader;
  storage: MemoryStorage;
  card: MemoryCard;
  logger: Logger;
  hardware: MemoryHardware;
  reload: () => void;
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
  const reload = jest.fn();
  function renderApp() {
    return render(
      <App
        card={card}
        hardware={hardware}
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
    reload,
    renderApp,
  };
}
