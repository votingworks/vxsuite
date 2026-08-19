import { AvahiService } from './avahi.js';
import { isValidIpv4Address } from './utils.js';

const VX_ADMIN_SERVICE_NAME_PREFIX = 'VxAdmin-';

/**
 * The avahi service name a VxAdmin host advertises on the network.
 */
export function getVxAdminServiceName(machineId: string): string {
  return `${VX_ADMIN_SERVICE_NAME_PREFIX}${machineId}`;
}

/**
 * Extracts the host machine ID from an advertised VxAdmin avahi service
 * name, or undefined if the name is not a VxAdmin service name.
 */
export function machineIdFromVxAdminServiceName(
  serviceName: string
): string | undefined {
  return serviceName.startsWith(VX_ADMIN_SERVICE_NAME_PREFIX)
    ? serviceName.slice(VX_ADMIN_SERVICE_NAME_PREFIX.length)
    : undefined;
}

/** A VxAdmin host machine advertised on the network. */
export interface VxAdminHostMachine {
  machineId: string;
  /** Base address of the host's peer API server, e.g. `http://10.0.0.2:3002`. */
  address: string;
}

/**
 * Discovers all VxAdmin host machines currently advertised on the network via
 * avahi, ignoring services that are not VxAdmin hosts or that don't resolve
 * to a valid IPv4 address.
 */
export async function findAllVxAdminHostMachines(): Promise<
  VxAdminHostMachine[]
> {
  const services = await AvahiService.discoverHttpServices();
  return services.flatMap((service) => {
    const machineId = machineIdFromVxAdminServiceName(service.name);
    if (machineId === undefined || !isValidIpv4Address(service.resolvedIp)) {
      return [];
    }
    return [
      {
        machineId,
        address: `http://${service.resolvedIp}:${service.port}`,
      },
    ];
  });
}
