import { beforeEach, expect, test, vi } from 'vitest';
import { MockBaseLogger, mockBaseLogger } from '@votingworks/logging';
import { MockPatConnectionStatusReader } from './mock_connection_status_reader';

let logger: MockBaseLogger<typeof vi.fn>;
let mockReader: MockPatConnectionStatusReader;

beforeEach(() => {
  logger = mockBaseLogger({ fn: vi.fn });
  mockReader = new MockPatConnectionStatusReader(logger);
});

test('open resolves', async () => {
  await expect(mockReader.open()).resolves.toEqual(true);
});

test('close resolves', async () => {
  await expect(mockReader.close()).resolves.toEqual(undefined);
});
