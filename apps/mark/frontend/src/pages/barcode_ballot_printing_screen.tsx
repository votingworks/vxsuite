import React from 'react';
import { ElectionDefinition, safeParseJson } from '@votingworks/types';
import type { MachineConfig } from '@votingworks/mark-backend';
import { getDefaultLanguageBallotStyleAndLanguage } from '@votingworks/utils';
import {
  clearLastBarcodeScan,
  getMostRecentBarcodeScan,
  getPrecinctsForBallotStyle,
} from '../api';
import { PrintBlankBallotScreen } from './print_blank_ballot_screen';

/** Extracts the ballot style ID from a scanned QR code's raw JSON contents. */
function parseScannedBallotStyleId(data: string): string | undefined {
  const parsed = safeParseJson(data).ok() as
    | { ballotStyleId?: unknown }
    | undefined;
  const ballotStyleId = parsed?.ballotStyleId;
  return typeof ballotStyleId === 'string' ? ballotStyleId : undefined;
}

export interface BarcodeBallotPrintingScreenProps {
  electionDefinition: ElectionDefinition;
  electionPackageHash: string;
  machineConfig: MachineConfig;
  pollingPlaceId: string;
  isLiveMode: boolean;
  /**
   * Rendered until a valid ballot style QR code is scanned, so the operator sees
   * the normal screen (poll worker menu or insert-card prompt) while waiting.
   */
  whileWaiting: JSX.Element;
}

/**
 * When VxMark is in `ballot_printing` barcode activation mode, watches for a
 * scanned ballot style QR code and, once one that resolves to a single precinct
 * at the configured polling place arrives, shows the blank ballot printing
 * screen locked to that ballot style and language. Until then (or for scans that
 * don't resolve to exactly one precinct) it renders {@link whileWaiting}.
 */
export function BarcodeBallotPrintingScreen({
  electionDefinition,
  electionPackageHash,
  machineConfig,
  pollingPlaceId,
  isLiveMode,
  whileWaiting,
}: BarcodeBallotPrintingScreenProps): JSX.Element {
  const { election } = electionDefinition;

  // Ignore scans that predate this screen (e.g. a stale diagnostic scan).
  const mountTime = React.useRef(Date.now());
  const mostRecentBarcodeScanQuery = getMostRecentBarcodeScan.useQuery();
  const clearLastBarcodeScanMutation = clearLastBarcodeScan.useMutation();

  const scan = mostRecentBarcodeScanQuery.data;
  const isFreshScan =
    !!scan && new Date(scan.timestamp).getTime() >= mountTime.current;

  const scannedBallotStyleId = isFreshScan
    ? parseScannedBallotStyleId(scan.data)
    : undefined;

  const normalized = scannedBallotStyleId
    ? getDefaultLanguageBallotStyleAndLanguage({
        election,
        ballotStyleId: scannedBallotStyleId,
      })
    : undefined;

  const precinctsQuery = getPrecinctsForBallotStyle.useQuery(
    normalized?.ballotStyleId
  );

  if (!normalized || !precinctsQuery.isSuccess) {
    return whileWaiting;
  }

  const precinctIds = precinctsQuery.data;
  // Only auto-navigate when the scanned ballot style maps to exactly one
  // precinct at this polling place; otherwise there's nothing to lock to.
  if (precinctIds.length !== 1) {
    return whileWaiting;
  }

  return (
    <PrintBlankBallotScreen
      isLiveMode={isLiveMode}
      electionPackageHash={electionPackageHash}
      electionDefinition={electionDefinition}
      election={election}
      machineConfig={machineConfig}
      pollingPlaceId={pollingPlaceId}
      onBackButtonPress={() => clearLastBarcodeScanMutation.mutate()}
      lockedBallotStyle={{
        precinctId: precinctIds[0],
        ballotStyleId: normalized.ballotStyleId,
        languageCode: normalized.languageCode,
      }}
    />
  );
}
