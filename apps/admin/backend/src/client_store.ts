import * as grout from '@votingworks/grout';
import { assert, Optional } from '@votingworks/basics';
import type { ElectionKey, Id, SystemSettings } from '@votingworks/types';
import { constructElectionKey } from '@votingworks/types';
import type { PeerApi } from './peer_app';
import {
  ClientConnectionStatus,
  ElectionRecord,
  type BaseStore,
} from './types';

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
 * In-memory store for client-mode state. Holds ephemeral connection status,
 * the active host connection, and cached data synced from the host.
 */
export class ClientStore implements BaseStore {
  private status: ClientConnectionStatus = ClientConnectionStatus.Offline;
  private hostConnection?: HostConnection;
  private cachedElectionRecord?: ElectionRecord;
  private cachedSystemSettings?: SystemSettings;
  private isClientAdjudicationEnabled = false;
  private onDisconnect?: () => void;

  getCurrentElectionId(): Optional<Id> {
    return this.cachedElectionRecord?.id;
  }

  getElectionKey(electionId: Id): Optional<ElectionKey> {
    if (!this.cachedElectionRecord) return undefined;
    assert(this.cachedElectionRecord.id === electionId);
    return constructElectionKey(
      this.cachedElectionRecord.electionDefinition.election
    );
  }

  getSystemSettings(electionId: Id): Optional<SystemSettings> {
    if (!this.cachedSystemSettings) return undefined;
    assert(this.cachedElectionRecord?.id === electionId);
    return this.cachedSystemSettings;
  }

  getCachedElectionRecord(): Optional<ElectionRecord> {
    return this.cachedElectionRecord;
  }

  setCachedElectionRecord(record?: ElectionRecord): void {
    this.cachedElectionRecord = record;
  }

  getCachedSystemSettings(): Optional<SystemSettings> {
    return this.cachedSystemSettings;
  }

  setCachedSystemSettings(settings?: SystemSettings): void {
    this.cachedSystemSettings = settings;
  }

  getConnectionStatus(): ClientConnectionStatus {
    return this.status;
  }

  getHostConnection(): HostConnection | undefined {
    return this.hostConnection;
  }

  setOnDisconnect(callback: () => void): void {
    this.onDisconnect = callback;
  }

  setConnection(
    status: ClientConnectionStatus,
    hostConnection?: HostConnection
  ): void {
    const wasConnected =
      this.status === ClientConnectionStatus.OnlineConnectedToHost;
    this.status = status;
    this.hostConnection = hostConnection;
    if (status !== ClientConnectionStatus.OnlineConnectedToHost) {
      this.cachedElectionRecord = undefined;
      this.cachedSystemSettings = undefined;
      this.isClientAdjudicationEnabled = false;
      if (wasConnected) {
        this.onDisconnect?.();
      }
    }
  }

  getIsClientAdjudicationEnabled(): boolean {
    return this.isClientAdjudicationEnabled;
  }

  setIsClientAdjudicationEnabled(enabled: boolean): void {
    this.isClientAdjudicationEnabled = enabled;
  }
}
