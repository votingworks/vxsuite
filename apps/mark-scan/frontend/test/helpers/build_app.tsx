import { fakeLogger, Logger } from '@votingworks/logging';
import { MemoryHardware } from '@votingworks/utils';
import { render, RenderResult } from '../react_testing_library';
import { App } from '../../src/app';
import { ScreenReader, TextToSpeech } from '../../src/config/types';
import { AriaScreenReader } from '../../src/utils/ScreenReader';
import { fakeTts } from './fake_tts';
import { createApiMock } from './mock_api_client';

export function buildApp(apiMock: ReturnType<typeof createApiMock>): {
  mockTts: TextToSpeech;
  screenReader: ScreenReader;
  logger: Logger;
  hardware: MemoryHardware;
  reload: () => void;
  renderApp: () => RenderResult;
} {
  const mockTts = fakeTts();
  const screenReader = new AriaScreenReader(mockTts);
  const logger = fakeLogger();
  const hardware = MemoryHardware.build({
    connectPrinter: true,
    connectAccessibleController: true,
  });
  const reload = jest.fn();
  function renderApp() {
    return render(
      <App
        hardware={hardware}
        reload={reload}
        logger={logger}
        apiClient={apiMock.mockApiClient}
      />
    );
  }

  return {
    mockTts,
    screenReader,
    logger,
    hardware,
    reload,
    renderApp,
  };
}
