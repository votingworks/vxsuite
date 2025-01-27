import { exec, ExecException } from 'node:child_process';
import { promisify } from 'node:util';
import { rootDebug } from './debug';

const debug = rootDebug.extend('networking');

const execPromise = promisify(exec);

interface AvahiDiscoveredService {
  name: string;
  host: string;
  port: string;
}

export class AvahiService {
  private static runningProcess: ReturnType<typeof exec> | null = null;

  /**
   * Advertises an HTTP service on the given port.
   * @param name - The name of the service to advertise.
   * @param port - The port of the HTTP service.
   * @returns A promise that resolves when the service starts.
   */
  static async advertiseHttpService(name: string, port: number): Promise<void> {
    const command = `avahi-publish-service ${name} _http._tcp ${port}`;
    return new Promise((resolve, reject) => {
      const process = exec(command, (error: ExecException | null) => {
        if (error) {
          reject(error);
        }
      });

      this.runningProcess = process;

      process.stdout?.on('data', (data) => {
        debug(`avahi-publish-service successful stdout: ${data}`);
        resolve();
      });

      process.stderr?.on('data', (data) => {
        debug(`avahi-publish-service stderr: ${data}`);
        resolve();
      });
    });
  }

  /**
   * Stops the currently running advertised service.
   */
  static stopAdvertisedService(): void {
    if (this.runningProcess) {
      this.runningProcess.kill();
      debug('Stopped advertised service.');
      this.runningProcess = null;
    }
  }

  static cleanup(): void {
    debug('Cleaning up Avahi service');
    this.stopAdvertisedService();
  }

  /**
   * Discovers HTTP services on the local network.
   * @returns A promise resolving to an array of discovered services.
   */
  static async discoverHttpServices(): Promise<AvahiDiscoveredService[]> {
    const command = `avahi-browse -r -t -p _http._tcp`;
    try {
      const { stdout } = await execPromise(command);
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
  private static parseBrowseOutput(output: string): AvahiDiscoveredService[] {
    const services: AvahiDiscoveredService[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (line.startsWith('=')) {
        // Indicated a resolved service
        const parts = line.split(';');
        if (parts.length >= 8) {
          const name = parts[3];
          const host = parts[6];
          const port = parts[8];
          services.push({ name, host, port });
        }
      }
    }

    return services;
  }

  // Checks if there is any network interface 'UP'.
  static async hasOnlineInterface(): Promise<boolean> {
    const command = 'ip link show | grep "state UP"';
    try {
      const { stdout, stderr } = await execPromise(command);
      debug(`ip link show stdout: ${stdout}`);
      return stdout.length > 0;
    } catch (error) {
      debug(`Error running ip link show: ${error}`);
      return false;
    }
  }
}
