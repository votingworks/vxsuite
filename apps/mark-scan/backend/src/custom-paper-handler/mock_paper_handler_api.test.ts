import {
  MockPaperHandlerDriver,
  MockPaperHandlerStatus,
  isMockPaperHandler,
} from '@votingworks/custom-paper-handler';
import { mockOf } from '@votingworks/test-utils';
import { buildMockPaperHandlerApi } from './mock_paper_handler_api';

jest.mock(
  '@votingworks/custom-paper-handler',
  (): typeof import('@votingworks/custom-paper-handler') => ({
    ...jest.requireActual('@votingworks/custom-paper-handler'),
    isMockPaperHandler: jest.fn() as unknown as typeof isMockPaperHandler,
  })
);

beforeEach(() => {
  mockOf(isMockPaperHandler).mockReturnValue(true);
});

test('getMockPaperHandlerStatus', () => {
  const paperHandler = new MockPaperHandlerDriver();
  const api = buildMockPaperHandlerApi({ paperHandler });

  expect(api.getMockPaperHandlerStatus()).toEqual<MockPaperHandlerStatus>(
    'noPaper'
  );

  paperHandler.setMockStatus('paperParked');
  expect(api.getMockPaperHandlerStatus()).toEqual<MockPaperHandlerStatus>(
    'paperParked'
  );

  // Expect no-op for non-mock paper handler:
  mockOf(isMockPaperHandler).mockReturnValue(false);
  expect(api.getMockPaperHandlerStatus()).toBeUndefined();
});

test('setMockPaperHandlerStatus', () => {
  const paperHandler = new MockPaperHandlerDriver();
  const api = buildMockPaperHandlerApi({ paperHandler });

  expect(paperHandler.getMockStatus()).toEqual<MockPaperHandlerStatus>(
    'noPaper'
  );

  api.setMockPaperHandlerStatus({ mockStatus: 'paperInserted' });
  expect(paperHandler.getMockStatus()).toEqual<MockPaperHandlerStatus>(
    'paperInserted'
  );

  // Expect no-op for non-mock paper handler:
  mockOf(isMockPaperHandler).mockReturnValue(false);
  api.setMockPaperHandlerStatus({ mockStatus: 'paperJammed' });
  expect(paperHandler.getMockStatus()).toEqual<MockPaperHandlerStatus>(
    'paperInserted'
  );
});
