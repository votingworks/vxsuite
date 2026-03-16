import * as grout from '@votingworks/grout';
import type { PeerApi } from './peer_app';
import { ClientConnectionStatus, type BaseStore } from './types';

/**
 * Active connection to a host machine, including the API client for
 * communicating with it.
 */
export interface HostConnection {
  readonly address: string;
  readonly machineId: string;
  readonly apiClient: grout.Client<PeerApi>;
}

/**
 * In-memory store for client-mode state. Holds ephemeral connection status
 * and the active host connection.
 */
export class ClientStore implements BaseStore {
  private status: ClientConnectionStatus = ClientConnectionStatus.Offline;
  private hostConnection?: HostConnection;

  // TODO(CARO) we should return the election of the currently connected host machine once we are retrieving that
  /* istanbul ignore next - not implemented yet @preserve */
  getCurrentElectionId(): undefined {
    return undefined;
  }

  /* istanbul ignore next - not implemented yet @preserve */
  getElectionKey(): undefined {
    return undefined;
  }

  /* istanbul ignore next - not implemented yet @preserve */
  getSystemSettings(): undefined {
    return undefined;
  }

  getConnectionStatus(): ClientConnectionStatus {
    return this.status;
  }

  getHostConnection(): HostConnection | undefined {
    return this.hostConnection;
  }

  setConnection(
    status: ClientConnectionStatus,
    hostConnection?: HostConnection
  ): void {
    this.status = status;
    this.hostConnection = hostConnection;
  }
}
