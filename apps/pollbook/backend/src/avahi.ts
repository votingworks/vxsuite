export { hasOnlineInterface } from '@votingworks/networking';
export type { AvahiDiscoveredService } from '@votingworks/networking';
import {
  AvahiService as SharedAvahiService,
  type AvahiDiscoveredService,
} from '@votingworks/networking';

/**
 * PollBook-specific wrapper around the shared AvahiService that preserves
 * the HTTP-specific method names used throughout the PollBook codebase.
 */
export class AvahiService {
  static advertiseHttpService(name: string, port: number): void {
    SharedAvahiService.advertiseService(name, port);
  }

  static stopAdvertisedService(name?: string): void {
    SharedAvahiService.stopAdvertisedService(name);
  }

  static async discoverHttpServices(): Promise<AvahiDiscoveredService[]> {
    return SharedAvahiService.discoverServices();
  }
}
