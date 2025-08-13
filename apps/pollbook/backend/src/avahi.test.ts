import { describe, it, expect, vi, afterEach } from 'vitest';
import { execFile } from '@votingworks/backend';
import { spawn } from 'node:child_process';
import { AvahiService, hasOnlineInterface } from './avahi';

vi.mock(import('@votingworks/backend'));
vi.mock(import('node:child_process'));
const mockExecFileFn = vi.mocked(execFile);
const mockSpawn = vi.mocked(spawn);

describe('hasOnlineInterface', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns true if stdout is non-empty', async () => {
    mockExecFileFn.mockResolvedValue({ stdout: 'eth0', stderr: '' });
    await expect(hasOnlineInterface()).resolves.toBe(true);
    expect(mockExecFileFn).toHaveBeenCalledWith('bash', [
      expect.stringContaining('is-online'),
    ]);
  });

  it('returns false if stdout is empty', async () => {
    mockExecFileFn.mockResolvedValue({ stdout: '', stderr: '' });
    await expect(hasOnlineInterface()).resolves.toBe(false);
  });

  it('returns false if execFile throws', async () => {
    mockExecFileFn.mockRejectedValue(new Error('fail'));
    await expect(hasOnlineInterface()).resolves.toBe(false);
  });
});

describe('AvahiService.advertiseHttpService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('spawns the intermediate avahi-publish-service script with bash', () => {
    mockSpawn.mockReturnValue({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
    } as unknown as ReturnType<typeof spawn>);
    AvahiService.advertiseHttpService('test-service', 1234);
    expect(mockSpawn).toHaveBeenCalledWith('bash', [
      expect.stringContaining('avahi-publish-service'),
      'test-service',
      '1234',
    ]);
  });
});

describe('AvahiService.stopAdvertisedService', () => {
  it('kills the running process if present by name', () => {
    const fakeProcess = { kill: vi.fn() } as unknown as ReturnType<
      typeof spawn
    >;
    const fakeProcess2 = { kill: vi.fn() } as unknown as ReturnType<
      typeof spawn
    >;
    const processMap = new Map<string, ReturnType<typeof spawn>>();
    processMap.set('test-service', fakeProcess);
    processMap.set('test-service-2', fakeProcess2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (AvahiService as any).runningProcesses = processMap;

    // nothing should happen with a bad service name
    AvahiService.stopAdvertisedService('fake-service');
    expect(fakeProcess.kill).not.toHaveBeenCalled();
    expect(fakeProcess2.kill).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((AvahiService as any).runningProcesses).toHaveLength(2);

    AvahiService.stopAdvertisedService('test-service');
    expect(fakeProcess.kill).toHaveBeenCalled();
    expect(fakeProcess2.kill).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((AvahiService as any).runningProcesses).toHaveLength(1);
  });

  it('kills all running process without name', () => {
    const fakeProcess = { kill: vi.fn() } as unknown as ReturnType<
      typeof spawn
    >;
    const fakeProcess2 = { kill: vi.fn() } as unknown as ReturnType<
      typeof spawn
    >;
    const processMap = new Map<string, ReturnType<typeof spawn>>();
    processMap.set('test-service', fakeProcess);
    processMap.set('test-service-2', fakeProcess2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (AvahiService as any).runningProcesses = processMap;
    AvahiService.stopAdvertisedService();
    expect(fakeProcess.kill).toHaveBeenCalled();
    expect(fakeProcess2.kill).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((AvahiService as any).runningProcesses).toHaveLength(0);
  });

  it('does nothing if no process is running', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (AvahiService as any).runningProcesses = new Map();
    expect(() => AvahiService.stopAdvertisedService()).not.toThrow();
  });
});

describe('AvahiService.discoverHttpServices', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns parsed services on success', async () => {
    const stdout =
      '=;eth0;IPv4;service1;Web Site;local;host1.local;192.168.1.2;8080;\n=;eth0;IPv4;service2;Web Site;local;host2.local;192.168.1.3;8081;';
    mockExecFileFn.mockResolvedValue({ stdout, stderr: '' });
    const services = await AvahiService.discoverHttpServices();
    expect(services).toEqual([
      {
        name: 'service1',
        host: 'host1.local',
        resolvedIp: '192.168.1.2',
        port: '8080',
      },
      {
        name: 'service2',
        host: 'host2.local',
        resolvedIp: '192.168.1.3',
        port: '8081',
      },
    ]);
  });

  it('returns parsed services on timeout', async () => {
    const stdout =
      '=;eth0;IPv4;service1;Web Site;local;host1.local;192.168.1.2;8080;\n=;eth0;IPv4;service2;Web Site;local;host2.local;192.168.1.3;8081;';
    mockExecFileFn.mockResolvedValue({ stdout, stderr: 'SIGINT QUITING...' });
    const services = await AvahiService.discoverHttpServices();
    expect(services).toEqual([
      {
        name: 'service1',
        host: 'host1.local',
        resolvedIp: '192.168.1.2',
        port: '8080',
      },
      {
        name: 'service2',
        host: 'host2.local',
        resolvedIp: '192.168.1.3',
        port: '8081',
      },
    ]);
  });

  it('returns [] if stderr is present and no stdout', async () => {
    mockExecFileFn.mockResolvedValue({ stdout: '', stderr: 'error' });
    const services = await AvahiService.discoverHttpServices();
    expect(services).toEqual([]);
  });

  it('returns [] if execFile throws', async () => {
    mockExecFileFn.mockRejectedValue(new Error('fail'));
    const services = await AvahiService.discoverHttpServices();
    expect(services).toEqual([]);
  });

  it('ignores lines that are not resolved services or incomplete', async () => {
    const stdout =
      '+;lo;IPv4;something;Web Site;local\n=;host1.local;192.168.1.2;8080;';
    mockExecFileFn.mockResolvedValue({ stdout, stderr: '' });
    const result = await AvahiService.discoverHttpServices();
    expect(result).toEqual([]);
  });

  it('ignores services on the lo interface or non-IPv4', async () => {
    const stdout =
      '=;lo;IPv4;service1;Web Site;local;host1.local;127.0.0.1;8080;\n=;eth0;IPv6;service2;Web Site;local;host2.local;::1;8081;';
    mockExecFileFn.mockResolvedValue({ stdout, stderr: '' });
    const result = await AvahiService.discoverHttpServices();
    expect(result).toEqual([]);
  });
});
