import { fakeLogger, Logger } from '@votingworks/logging';
import { render, RenderResult } from '../react_testing_library';
import { App } from '../../src/app';

export function buildApp(): {
  logger: Logger;
  renderApp: () => RenderResult;
} {
  const logger = fakeLogger();
  function renderApp() {
    return render(App({ logger }));
  }
  return { renderApp, logger };
}
