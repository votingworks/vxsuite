import { fakeLogger } from '@votingworks/logging';
import { fakePrinter } from '@votingworks/test-utils';
import { ConverterClientType } from '@votingworks/types';
import { MemoryHardware } from '@votingworks/utils';
import { App } from '../../src/app';
import { renderRootElement } from '../render_in_app_context';
import { ApiMock } from './api_mock';

function mockRandomBallotId() {
  return 'Asdf1234Asdf12';
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildApp(apiMock: ApiMock, converter?: ConverterClientType) {
  const hardware = MemoryHardware.build({
    connectCardReader: true,
    connectPrinter: true,
  });
  const logger = fakeLogger();
  const printer = fakePrinter();
  function renderApp() {
    return renderRootElement(
      App({
        hardware,
        printer,
        converter,
        generateBallotId: mockRandomBallotId,
      }),
      {
        apiClient: apiMock.apiClient,
        logger,
      }
    );
  }
  return { apiMock, hardware, logger, printer, renderApp };
}
