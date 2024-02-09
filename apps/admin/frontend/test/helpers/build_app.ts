import { fakeLogger } from '@votingworks/logging';
import { fakePrinter } from '@votingworks/test-utils';
import { ConverterClientType } from '@votingworks/types';
import { App } from '../../src/app';
import { renderRootElement } from '../render_in_app_context';
import { ApiMock } from './mock_api_client';

function mockRandomBallotId() {
  return 'Asdf1234Asdf12';
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildApp(apiMock: ApiMock, converter?: ConverterClientType) {
  const logger = fakeLogger();
  const printer = fakePrinter();
  function renderApp() {
    return renderRootElement(
      App({
        printer,
        converter,
        logger,
        generateBallotId: mockRandomBallotId,
      }),
      {
        apiClient: apiMock.apiClient,
      }
    );
  }
  return { apiMock, logger, printer, renderApp };
}
