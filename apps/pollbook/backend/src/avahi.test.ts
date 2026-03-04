import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  AvahiService as SharedAvahiService,
  hasOnlineInterface as sharedHasOnlineInterface,
} from '@votingworks/networking';
import { AvahiService, hasOnlineInterface } from './avahi';

vi.mock(import('@votingworks/networking'));
const mockSharedHasOnlineInterface = vi.mocked(sharedHasOnlineInterface);
const mockSharedAvahiService = vi.mocked(SharedAvahiService);

describe('hasOnlineInterface', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to shared lib hasOnlineInterface', async () => {
    mockSharedHasOnlineInterface.mockResolvedValue(true);
    await expect(hasOnlineInterface()).resolves.toBe(true);
    expect(mockSharedHasOnlineInterface).toHaveBeenCalled();
  });
});

describe('AvahiService.advertiseHttpService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to shared AvahiService.advertiseService', () => {
    AvahiService.advertiseHttpService('test-service', 1234);
    expect(mockSharedAvahiService.advertiseService).toHaveBeenCalledWith(
      'test-service',
      1234
    );
  });
});

describe('AvahiService.stopAdvertisedService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to shared AvahiService.stopAdvertisedService with name', () => {
    AvahiService.stopAdvertisedService('test-service');
    expect(
      mockSharedAvahiService.stopAdvertisedService
    ).toHaveBeenCalledWith('test-service');
  });

  it('delegates to shared AvahiService.stopAdvertisedService without name', () => {
    AvahiService.stopAdvertisedService();
    expect(
      mockSharedAvahiService.stopAdvertisedService
    ).toHaveBeenCalledWith(undefined);
  });
});

describe('AvahiService.discoverHttpServices', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to shared AvahiService.discoverServices', async () => {
    const mockServices = [
      {
        name: 'service1',
        host: 'host1.local',
        resolvedIp: '192.168.1.2',
        port: '8080',
      },
    ];
    mockSharedAvahiService.discoverServices.mockResolvedValue(mockServices);
    const services = await AvahiService.discoverHttpServices();
    expect(services).toEqual(mockServices);
    expect(mockSharedAvahiService.discoverServices).toHaveBeenCalled();
  });
});
