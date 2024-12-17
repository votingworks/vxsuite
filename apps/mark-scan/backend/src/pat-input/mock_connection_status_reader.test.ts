import { MockBaseLogger, mockBaseLogger } from '@votingworks/logging';
import { MockPatConnectionStatusReader } from './mock_connection_status_reader';

let logger: MockBaseLogger<typeof jest.fn>;
let mockReader: MockPatConnectionStatusReader;

beforeEach(() => {
  logger = mockBaseLogger({ fn: jest.fn });
  mockReader = new MockPatConnectionStatusReader(logger);
});

test('open resolves', async () => {
  await expect(mockReader.open()).resolves.toEqual(true);
});

test('close resolves', async () => {
  await expect(mockReader.close()).resolves.toEqual(undefined);
});
