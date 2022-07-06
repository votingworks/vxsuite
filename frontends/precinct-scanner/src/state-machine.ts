// eslint-disable-next-line vx/gts-module-snake-case
import { Scan } from '@votingworks/api';
import { unsafeParse } from '@votingworks/types';
import { fetchJson, typedAs } from '@votingworks/utils';
import {
  AnyEventObject,
  assign,
  createMachine,
  DoneInvokeEvent,
  InvokeConfig,
  send,
} from 'xstate';
import { pure } from 'xstate/lib/actions';

async function getScannerStatus() {
  return unsafeParse(
    Scan.GetScanStatusResponseSchema,
    await fetchJson('/scan/status')
  );
}

async function startScan() {
  const result = await (
    await fetch('/scan/scanBatch', { method: 'post' })
  ).json();
  if (result.status === 'error') {
    throw new Error(result.error);
  }
  return result;
}

async function endBatch() {
  // calling scanContinue will "naturally" end the batch because services/scan
  // will see there's no more paper
  const body: Scan.ScanContinueRequest = {
    forceAccept: false,
  };
  return await fetch('/scan/scanContinue', {
    method: 'post',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function scannerStateToTransition(scannerStatus: Scan.ScannerStatus) {
  return {
    [Scan.ScannerStatus.WaitingForPaper]: 'SCANNER_WAITING_FOR_PAPER',
    [Scan.ScannerStatus.ReadyToScan]: 'SCANNER_READY_TO_SCAN',
    [Scan.ScannerStatus.Scanning]: 'SCANNER_SCANNING',
    [Scan.ScannerStatus.Accepting]: 'SCANNER_ACCEPTING',
    [Scan.ScannerStatus.Rejecting]: 'SCANNER_REJECTING',
    [Scan.ScannerStatus.ReadyToAccept]: 'SCANNER_READY_TO_ACCEPT',
    [Scan.ScannerStatus.Rejected]: 'SCANNER_REJECTED',
    [Scan.ScannerStatus.Calibrating]: 'SCANNER_CALIBRATING',
    [Scan.ScannerStatus.Error]: 'SCANNER_ERROR',
    [Scan.ScannerStatus.Unknown]: 'SCANNER_UNKNOWN',
  }[scannerStatus];
}

const checkPaperStatus: InvokeConfig<unknown, any> = {
  src: getScannerStatus,
  onDone: {
    actions: pure((_context, event: DoneInvokeEvent<Scan.ScanStatus>) => {
      const { scanner } = event.data;
      console.log('Scanner status:', scanner);
      return send(scannerStateToTransition(scanner));
    }),
  },
  onError: {
    target: 'scan_error',
  },
};

const pollScannerStatus: InvokeConfig<unknown, any> = {
  src: () => (callback) => {
    const interval = setInterval(async () => {
      const { scanner, adjudication } = await getScannerStatus();
      callback({
        type: scannerStateToTransition(scanner),
        adjudication,
      });
    }, 1000);
    return () => clearInterval(interval);
  },
};

interface Context {
  adjudication?: Scan.AdjudicationStatus;
}

export const machine = createMachine({
  id: 'Precinct Scanner',
  initial: 'connecting',
  strict: true,
  context: typedAs<Context>({ adjudication: undefined }),
  states: {
    connecting: {
      invoke: checkPaperStatus,
      on: {
        SCANNER_WAITING_FOR_PAPER: 'waiting_for_paper',
        SCANNER_READY_TO_SCAN: 'ready_to_scan',
        SCANNER_REJECTING: 'rejecting',
        SCANNER_REJECTED: 'rejected',
        SCANNER_ERROR: 'scan_error',
      },
    },
    waiting_for_paper: {
      invoke: pollScannerStatus,
      on: {
        SCANNER_READY_TO_SCAN: 'ready_to_scan',
        SCANNER_REJECTED: 'rejected',
        SCANNER_ERROR: 'scan_error',
      },
    },
    ready_to_scan: {
      invoke: { src: startScan, onDone: 'scanning', onError: 'scan_error' },
    },
    scanning: {
      invoke: pollScannerStatus,
      on: {
        SCANNER_SCANNING: 'scanning',
        SCANNER_REJECTING: 'rejecting',
        SCANNER_REJECTED: 'rejected',
        SCANNER_READY_TO_ACCEPT: 'accepting',
        SCANNER_ACCEPTING: 'accepting',
        SCANNER_ERROR: 'scan_error',
      },
    },
    accepting: {
      invoke: pollScannerStatus,
      on: {
        SCANNER_ACCEPTING: 'accepting',
        SCANNER_WAITING_FOR_PAPER: 'end_batch',
      },
    },
    rejecting: {
      invoke: pollScannerStatus,
      on: {
        SCANNER_REJECTING: 'rejecting',
        SCANNER_REJECTED: {
          target: 'rejected',
          actions: assign<Context, AnyEventObject>((_, event) => ({
            adjudication: event['adjudication'],
          })),
        },
      },
    },
    rejected: {
      invoke: pollScannerStatus,
      on: {
        SCANNER_WAITING_FOR_PAPER: 'end_batch',
      },
    },
    end_batch: {
      invoke: {
        src: endBatch,
        onDone: {
          target: 'waiting_for_paper',
          actions: assign<Context, DoneInvokeEvent<any>>({
            adjudication: undefined,
          }),
        },
        onError: 'scan_error',
      },
    },
    scan_error: {
      invoke: pollScannerStatus,
      on: {
        SCANNER_WAITING_FOR_PAPER: 'waiting_for_paper',
      },
    },
  },
});
