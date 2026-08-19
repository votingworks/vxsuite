import { deepEqual } from '@votingworks/basics';
import { BaseLogger, LogEventId } from '@votingworks/logging';
import {
  findAllVxAdminHostMachines,
  hasOnlineInterface,
  NETWORK_POLLING_INTERVAL_MS,
} from '@votingworks/networking';
import makeDebug from 'debug';
import { Store } from './store.js';
import { NetworkConnectionInfo } from './types.js';

const debug = makeDebug('scan:networking');

/**
 * Starts scanner networking: watches the network for an advertised VxAdmin
 * host via avahi and tracks the scanner's connection status in the store.
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

  function setConnectionInfo(newInfo: NetworkConnectionInfo): void {
    const currentInfo = store.getNetworkConnectionInfo();
    if (!deepEqual(currentInfo, newInfo)) {
      logger.log(LogEventId.CentralScanNetworkStatus, 'system', {
        message: `Scanner connection status changed from ${currentInfo.status} to ${newInfo.status}.`,
        previousStatus: currentInfo.status,
        newStatus: newInfo.status,
        hostMachineId: newInfo.hostMachineId ?? 'none',
      });
    }
    store.setNetworkConnectionInfo(newInfo);
  }

  let isPolling = false;

  process.nextTick(() => {
    setInterval(async () => {
      /* istanbul ignore next - re-entrancy guard */
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

        // TODO(@caro) - Handle error conditions when there are multiple hosts, mismatched code versions, mismatched ballot hashes, etc.
        const [hostMachine] = hostMachines;
        setConnectionInfo({
          status: 'online-host-detected',
          hostMachineId: hostMachine.machineId,
        });
      } catch (error) {
        /* istanbul ignore next - defensive */
        debug('Error in scanner networking loop: %s', error);
      } finally {
        isPolling = false;
      }
    }, NETWORK_POLLING_INTERVAL_MS);
  });
}
