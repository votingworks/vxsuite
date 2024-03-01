import { BaseLogger, mockBaseLogger } from '@votingworks/logging';
import { MockPatConnectionStatusReader } from './mock_connection_status_reader';

let logger: BaseLogger;
let mockReader: MockPatConnectionStatusReader;

beforeEach(() => {
  logger = mockBaseLogger();
  mockReader = new MockPatConnectionStatusReader(logger);
});

test('open resolves', async () => {
  await expect(mockReader.open()).resolves.toEqual(true);
});

test('close resolves', async () => {
  await expect(mockReader.close()).resolves.toEqual(undefined);
});
