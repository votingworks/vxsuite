import { spawn } from 'node:child_process';
import { execFile } from '@votingworks/backend';
import { rootDebug } from './debug';
import { intermediateScript } from './intermediate_scripts';

const debug = rootDebug.extend('avahi');

const DEFAULT_SERVICE_TYPE = '_http._tcp';

export interface AvahiDiscoveredService {
  name: string;
  host: string;
  resolvedIp: string;
  port: string;
}

/**
 * Checks if there is any network interface 'UP'.
 */
export async function hasOnlineInterface(): Promise<boolean> {
  try {
    const { stdout } = await execFile('bash', [
      intermediateScript('is-online'),
    ]);
    debug(`ip link show stdout: ${stdout}`);
    return stdout.length > 0;
  } catch (error) {
    debug(`Error running ip link show: ${error}`);
    return false;
  }
}

export class AvahiService {
  private static readonly runningProcesses: Map<
    string,
    ReturnType<typeof spawn>
  > = new Map();

  /**
   * Advertises a service on the given port.
   * @param name - The name of the service to advertise.
   * @param port - The port of the service.
   * @param serviceType - The avahi service type (defaults to `_http._tcp`).
   */
  static advertiseService(
    name: string,
    port: number,
    serviceType: string = DEFAULT_SERVICE_TYPE
  ): void {
    const process = spawn('bash', [
      intermediateScript('avahi-publish-service'),
      name,
      `${port}`,
      serviceType,
    ]);

    this.runningProcesses.set(name, process);
  }

  /**
   * Stops the currently running advertised service.
   */
  static stopAdvertisedService(name?: string): void {
    if (name) {
      const process = this.runningProcesses.get(name);
      if (process) {
        process.kill();
        this.runningProcesses.delete(name);
        debug(`Stopped advertised service: ${name}`);
      }
    } else {
      // Stop all services
      for (const [serviceName, process] of this.runningProcesses) {
        process.kill();
        debug(`Stopped advertised service: ${serviceName}`);
      }
      this.runningProcesses.clear();
    }
  }

  /**
   * Discovers services on the local network.
   * @param serviceType - The avahi service type to discover (defaults to `_http._tcp`).
   * @returns A promise resolving to an array of discovered services.
   */
  static async discoverServices(
    serviceType: string = DEFAULT_SERVICE_TYPE
  ): Promise<AvahiDiscoveredService[]> {
    try {
      const { stdout, stderr } = await execFile('bash', [
        intermediateScript('avahi-browse'),
        serviceType,
      ]);
      // Only return with an error if there is not stdout output, otherwise try to parse it.
      if (stderr && !stdout) {
        debug(`avahi-browse stderr: ${stderr}`);
        return [];
      }
      debug(`avahi-browse stdout: ${stdout}`);
      return AvahiService.parseBrowseOutput(stdout);
    } catch (error) {
      debug(`Error running avahi-browse: ${error}`);
      return [];
    }
  }

  /**
   * Parses the output from `avahi-browse` to extract service information.
   * The output will look something like this:
   * +;lo;IPv4;something;Web Site;local
   * =;lo;IPv4;something;Web Site;local;debian-12.local;127.0.0.1;8080;
   *
   * @param output - The raw output from the `avahi-browse` command.
   * @returns An array of service objects containing the name, host, and port.
   */
  static parseBrowseOutput(output: string): AvahiDiscoveredService[] {
    const services: AvahiDiscoveredService[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (line.startsWith('=')) {
        // Indicates a resolved service
        const parts = line.split(';');
        if (parts.length >= 9) {
          const iface = parts[1] as string;
          if (iface === 'lo') {
            continue;
          }
          const type = parts[2] as string;
          if (type !== 'IPv4') {
            continue;
          }
          const name = parts[3] as string;
          const host = parts[6] as string;
          const resolvedIp = parts[7] as string;
          const port = parts[8] as string;
          services.push({ name, host, resolvedIp, port });
        }
      }
    }

    return services;
  }
}
