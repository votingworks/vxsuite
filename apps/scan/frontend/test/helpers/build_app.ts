import { mockBaseLogger, BaseLogger } from '@votingworks/logging';
import { render, RenderResult } from '../react_testing_library';
import { App } from '../../src/app';

export function buildApp(): {
  logger: BaseLogger;
  renderApp: () => RenderResult;
} {
  const logger = mockBaseLogger();
  function renderApp() {
    return render(App({ logger }));
  }
  return { renderApp, logger };
}
