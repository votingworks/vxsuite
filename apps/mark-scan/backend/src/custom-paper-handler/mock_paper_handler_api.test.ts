import { beforeEach, expect, test, vi } from 'vitest';
import {
  MockPaperHandlerDriver,
  MockPaperHandlerStatus,
  isMockPaperHandler,
} from '@votingworks/custom-paper-handler';
import { buildMockPaperHandlerApi } from './mock_paper_handler_api';

vi.mock(import('@votingworks/custom-paper-handler'), async (importActual) => ({
  ...(await importActual()),
  isMockPaperHandler: vi.fn() as unknown as typeof isMockPaperHandler,
}));

beforeEach(() => {
  vi.mocked(isMockPaperHandler).mockReturnValue(true);
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
  vi.mocked(isMockPaperHandler).mockReturnValue(false);
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
  vi.mocked(isMockPaperHandler).mockReturnValue(false);
  api.setMockPaperHandlerStatus({ mockStatus: 'paperJammed' });
  expect(paperHandler.getMockStatus()).toEqual<MockPaperHandlerStatus>(
    'paperInserted'
  );
});
