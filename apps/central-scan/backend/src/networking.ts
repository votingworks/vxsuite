import { Optional, throwIllegalValue } from '@votingworks/basics';
import * as grout from '@votingworks/grout';
import { BaseLogger, LogEventId } from '@votingworks/logging';
import {
  findAllVxAdminHostMachines,
  hasOnlineInterface,
  NETWORK_POLLING_INTERVAL_MS,
  NETWORK_REQUEST_TIMEOUT_MS,
  RegisterScannerError,
  VxAdminHostApi,
  VxAdminHostMachine,
} from '@votingworks/networking';
import makeDebug from 'debug';
import { getMachineConfig } from './machine_config.js';
import { Store } from './store.js';
import { NetworkConnectionInfo } from './types.js';

const debug = makeDebug('scan:networking');

function connectionInfoForRegistrationError(
  error: RegisterScannerError,
  hostMachineId: string
): NetworkConnectionInfo {
  switch (error.type) {
    case 'code-version-mismatch':
      return { status: 'online-code-version-mismatch', hostMachineId };
    case 'scanner-unconfigured':
      return { status: 'online-machine-unconfigured', hostMachineId };
    case 'host-unconfigured':
      return { status: 'online-host-unconfigured', hostMachineId };
    case 'ballot-hash-mismatch':
      return { status: 'online-ballot-hash-mismatch', hostMachineId };
    case 'results-official':
      return { status: 'online-results-official', hostMachineId };
    case 'invalid-mode':
      return {
        status: 'online-invalid-mode',
        hostMachineId,
        hostCvrFileMode: error.currentMode,
      };
    default:
      return throwIllegalValue(error, 'type');
  }
}

/**
 * Starts scanner networking: watches the network for an advertised VxAdmin
 * host via avahi, registers with it (the host refuses registration when the
 * scanner is incompatible — different software version or election), and
 * tracks the resulting connection status in the store.
 */
export function startScannerNetworking({
  logger,
  store,
}: {
  logger: BaseLogger;
  store: Store;
}): void {
  debug('Starting scanner networking');
  logger.log(LogEventId.CentralScanNetworkStatus, 'system', {
    message: 'Starting VxAdmin host discovery.',
  });

  function hostMachineIdOf(info: NetworkConnectionInfo): Optional<string> {
    return 'hostMachineId' in info ? info.hostMachineId : undefined;
  }

  // Logs only status and host changes, not every heartbeat's refresh of the
  // host's imported-batch list.
  function setConnectionInfo(newInfo: NetworkConnectionInfo): void {
    const currentInfo = store.getNetworkConnectionInfo();
    if (
      currentInfo.status !== newInfo.status ||
      hostMachineIdOf(currentInfo) !== hostMachineIdOf(newInfo)
    ) {
      logger.log(LogEventId.CentralScanNetworkStatus, 'system', {
        message: `Scanner connection status changed from ${currentInfo.status} to ${newInfo.status}.`,
        previousStatus: currentInfo.status,
        newStatus: newInfo.status,
        hostMachineId: hostMachineIdOf(newInfo) ?? 'none',
      });
    }
    store.setNetworkConnectionInfo(newInfo);
  }

  function createApiClient(address: string): grout.Client<VxAdminHostApi> {
    return grout.createClient<VxAdminHostApi>({
      baseUrl: `${address}/api`,
      timeout: NETWORK_REQUEST_TIMEOUT_MS,
    });
  }

  let isPolling = false;

  process.nextTick(() => {
    setInterval(async () => {
      // @coverage-exclude: re-entrancy guard
      if (isPolling) return;
      isPolling = true;

      try {
        if (!(await hasOnlineInterface())) {
          debug('No online interface found, skipping discovery');
          setConnectionInfo({ status: 'offline' });
          return;
        }

        const hostMachines = await findAllVxAdminHostMachines();

        if (hostMachines.length === 0) {
          setConnectionInfo({ status: 'online-waiting-for-host' });
          return;
        }

        let hostMachine: VxAdminHostMachine;
        if (hostMachines.length === 1) {
          [hostMachine] = hostMachines;
        } else {
          // Avahi advertisements alone can be stale (e.g. an orphaned
          // advertisement from a rebooted VxAdmin), so verify each advertised
          // host by communicating with it before declaring a conflict.
          const reachableHosts: VxAdminHostMachine[] = [];
          for (const candidate of hostMachines) {
            try {
              await createApiClient(
                candidate.address
              ).getCurrentElectionMetadata();
              reachableHosts.push(candidate);
            } catch {
              debug(
                'Advertised host %s at %s unreachable, ignoring',
                candidate.machineId,
                candidate.address
              );
            }
          }
          if (reachableHosts.length === 0) {
            setConnectionInfo({ status: 'online-waiting-for-host' });
            return;
          }
          if (reachableHosts.length > 1) {
            debug(
              'Multiple reachable VxAdmin hosts found on network (%d)',
              reachableHosts.length
            );
            setConnectionInfo({ status: 'online-multiple-hosts-detected' });
            return;
          }
          [hostMachine] = reachableHosts;
        }
        const { machineId: hostMachineId } = hostMachine;
        const apiClient = createApiClient(hostMachine.address);

        const { machineId, codeVersion } = getMachineConfig();
        let registerResult;
        const registerRequestedAt = Date.now();
        try {
          registerResult = await apiClient.registerScanner({
            machineId,
            codeVersion,
            ballotHash:
              store.getElectionRecord()?.electionDefinition.ballotHash,
            pollingPlaceId: store.getPollingPlaceId(),
            isTestMode: store.getTestMode(),
          });
        } catch (error) {
          debug('Host at %s unreachable: %s', hostMachine.address, error);
          setConnectionInfo({ status: 'online-waiting-for-host' });
          return;
        }

        if (registerResult.isErr()) {
          const error = registerResult.err();
          debug('Host %s refused registration: %s', hostMachineId, error.type);
          setConnectionInfo(
            connectionInfoForRegistrationError(error, hostMachineId)
          );
          return;
        }

        setConnectionInfo({
          status: 'online-host-detected',
          hostMachineId,
          hostAddress: hostMachine.address,
        });
        const removedBatches = store.markBatchesRemovedFromAdmin(
          registerResult.ok().importedBatchIds,
          registerRequestedAt
        );
        for (const batch of removedBatches) {
          logger.log(LogEventId.CentralScanNetworkStatus, 'system', {
            message: `${batch.label} was sent to VxAdmin ${hostMachineId}, but the host no longer holds its cast vote records. It can be sent again from the Scan Ballots screen.`,
            disposition: 'failure',
            batchId: batch.id,
            hostMachineId,
          });
        }
      } catch (error) {
        // @coverage-exclude: defensive
        debug('Error in scanner networking loop: %s', error);
      } finally {
        isPolling = false;
      }
    }, NETWORK_POLLING_INTERVAL_MS);
  });
}
