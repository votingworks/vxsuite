import { expect, test, vi } from 'vitest';
import { AvahiService } from './avahi.js';
import {
  findAllVxAdminHostMachines,
  getVxAdminServiceName,
  machineIdFromVxAdminServiceName,
} from './vx_admin_service.js';

test('getVxAdminServiceName', () => {
  expect(getVxAdminServiceName('0000')).toEqual('VxAdmin-0000');
  expect(getVxAdminServiceName('machine-123')).toEqual('VxAdmin-machine-123');
});

test('machineIdFromVxAdminServiceName', () => {
  expect(machineIdFromVxAdminServiceName('VxAdmin-0000')).toEqual('0000');
  expect(machineIdFromVxAdminServiceName('VxAdmin-machine-123')).toEqual(
    'machine-123'
  );
  // avahi renames a service after a name collision
  expect(machineIdFromVxAdminServiceName('VxAdmin-0000 #2')).toEqual('0000');
  expect(machineIdFromVxAdminServiceName('VxPollBook-0000')).toBeUndefined();
  expect(machineIdFromVxAdminServiceName('VxAdmin')).toBeUndefined();
});

test('findAllVxAdminHostMachines finds advertised VxAdmin hosts', async () => {
  vi.spyOn(AvahiService, 'discoverHttpServices').mockResolvedValue([
    {
      name: 'VxAdmin-0002',
      host: 'admin.local',
      resolvedIp: '192.168.1.10',
      port: '3002',
    },
    // Not a VxAdmin service
    {
      name: 'VxPollBook-0003',
      host: 'pollbook.local',
      resolvedIp: '192.168.1.20',
      port: '3002',
    },
    // Invalid IPv4 address
    {
      name: 'VxAdmin-0004',
      host: 'other-admin.local',
      resolvedIp: 'fe80::1',
      port: '3002',
    },
  ]);
  expect(await findAllVxAdminHostMachines()).toEqual([
    { machineId: '0002', address: 'http://192.168.1.10:3002' },
  ]);
});
