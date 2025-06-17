import { vi, expect, test, beforeEach } from 'vitest';
import { execFile } from '@votingworks/backend';
import { withApp } from '../test/app';
import { AvahiService } from './avahi';

vi.mock('./avahi.js', () => ({
  hasOnlineInterface: vi.fn().mockResolvedValue(false),
  AvahiService: {
    advertiseHttpService: vi.fn().mockReturnValue(undefined),
    stopAdvertisedService: vi.fn(),
    discoverHttpServices: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock(import('@votingworks/backend'));
const mockExecFileFn = vi.mocked(execFile);

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

test('resetNetwork calls resetNetworkSetup and AvahiService methods', async () => {
  await withApp(async ({ localApiClient }) => {
    // Call resetNetwork on the localApiClient
    mockExecFileFn.mockResolvedValue({ stdout: '', stderr: '' });
    void localApiClient.resetNetwork();
    await vi.waitFor(() => {
      expect(AvahiService.stopAdvertisedService).toHaveBeenCalled();
    });

    // Fast-forward timers to allow sleep(5000) to resolve
    vi.advanceTimersByTime(5000);
    expect(mockExecFileFn).toHaveBeenCalledWith('sudo', [
      expect.stringContaining('reset-network'),
    ]);

    expect(AvahiService.advertiseHttpService).toHaveBeenCalled();
  });
});
