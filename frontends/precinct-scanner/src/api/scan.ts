import {
  AdjudicationReasonInfo,
  safeParseJson,
  unsafeParse,
} from '@votingworks/types';
import { Scan } from '@votingworks/api';
import { fetchJson } from '@votingworks/utils';
import makeDebug from 'debug';
import {
  RejectedScanningReason,
  ScanningResult,
  ScanningResultType,
} from '../config/types';

const debug = makeDebug('precinct-scanner:api:scan');

export interface ScannerStatusDetails {
  ballotNeedsReview: boolean;
  scannerState: Scan.ScannerStatus;
  ballotCount: number;
  canUnconfigure?: boolean;
}

export async function getCurrentStatus(): Promise<ScannerStatusDetails> {
  const { scanner, batches, adjudication, canUnconfigure } = unsafeParse(
    Scan.GetScanStatusResponseSchema,
    await fetchJson('/scan/status')
  );
  const ballotCount =
    batches &&
    batches
      .filter((batch) => batch.endedAt)
      .reduce((prev, batch) => prev + batch.count, 0);
  return {
    ballotNeedsReview: adjudication.remaining > 0,
    scannerState: scanner,
    ballotCount,
    canUnconfigure,
  };
}

export async function scanDetectedSheet(): Promise<ScanningResult> {
  const result = await (
    await fetch('/scan/scanBatch', { method: 'post' })
  ).json();

  if (result.status === 'error') {
    throw new Error(result.error);
  }

  const { batchId } = result;

  for (;;) {
    const status = unsafeParse(
      Scan.GetScanStatusResponseSchema,
      await fetchJson('/scan/status')
    );
    const batch = status.batches.find(({ id }) => id === batchId);

    if (!batch) {
      throw new Error(`batch not found: ${batchId}`);
    }

    if (batch.endedAt && status.adjudication.remaining === 0) {
      if (batch.count === 0) {
        // This can happen if the paper is yanked out during scanning.
        return {
          resultType: ScanningResultType.Rejected,
          rejectionReason: RejectedScanningReason.Unknown,
        };
      }
      return { resultType: ScanningResultType.Accepted };
    }

    const adjudicationReasons: AdjudicationReasonInfo[] = [];
    if (status.adjudication.remaining > 0) {
      const sheetInfo = unsafeParse(
        Scan.GetNextReviewSheetResponseSchema,
        await fetchJson('/scan/hmpb/review/next-sheet')
      );

      for (const { interpretation } of [
        sheetInfo.interpreted.front,
        sheetInfo.interpreted.back,
      ]) {
        if (interpretation.type === 'InvalidTestModePage') {
          return {
            resultType: ScanningResultType.Rejected,
            rejectionReason: RejectedScanningReason.InvalidTestMode,
          };
        }
        if (interpretation.type === 'InvalidElectionHashPage') {
          return {
            resultType: ScanningResultType.Rejected,
            rejectionReason: RejectedScanningReason.InvalidElectionHash,
          };
        }
        if (interpretation.type === 'InvalidPrecinctPage') {
          return {
            resultType: ScanningResultType.Rejected,
            rejectionReason: RejectedScanningReason.InvalidPrecinct,
          };
        }
        if (interpretation.type === 'InterpretedHmpbPage') {
          if (interpretation.adjudicationInfo.requiresAdjudication) {
            for (const reasonInfo of interpretation.adjudicationInfo
              .enabledReasonInfos) {
              adjudicationReasons.push(reasonInfo);
            }
          }
        } else {
          return {
            resultType: ScanningResultType.Rejected,
            rejectionReason: RejectedScanningReason.Unreadable,
          };
        }
      }
      return {
        resultType: ScanningResultType.NeedsReview,
        adjudicationReasonInfo: adjudicationReasons,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function acceptBallotAfterReview(): Promise<boolean> {
  const body: Scan.ScanContinueRequest = {
    forceAccept: true,
    frontMarkAdjudications: [],
    backMarkAdjudications: [],
  };
  const result = await (
    await fetch('/scan/scanContinue', {
      method: 'post',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
      },
    })
  ).json();
  if (result.status !== 'ok') {
    debug('could not scan: %o', result);
    return false;
  }
  return true;
}

export async function endBatch(): Promise<boolean> {
  // calling scanContinue will "naturally" end the batch because services/scan
  // will see there's no more paper
  const body: Scan.ScanContinueRequest = {
    forceAccept: false,
  };
  const result = await (
    await fetch('/scan/scanContinue', {
      method: 'post',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
      },
    })
  ).json();
  if (result.status !== 'ok') {
    debug('failed to end batch: %o', result);
    return false;
  }
  return true;
}

export async function calibrate(): Promise<boolean> {
  const response = await fetch('/scan/calibrate', {
    method: 'post',
    headers: { Accept: 'application/json' },
  });

  return (
    safeParseJson(await response.text(), Scan.CalibrateResponseSchema).ok()
      ?.status === 'ok'
  );
}

export async function getExport(): Promise<string> {
  const response = await fetch('/scan/export', {
    method: 'post',
  });
  if (response.status !== 200) {
    debug('failed to get scan export: %o', response);
    throw new Error('failed to generate scan export');
  }
  return await response.text();
}
