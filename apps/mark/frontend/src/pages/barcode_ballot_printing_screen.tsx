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

/**
 * Extracts the ballot style ID and optional precinct ID from a scanned QR code's
 * raw JSON contents. Returns undefined when there is no usable ballot style ID.
 */
function parseScannedQrCode(
  data: string
): { ballotStyleId: string; precinctId?: string } | undefined {
  // Wire keys are abbreviated (`bsId`/`pId`) to keep the payload small; map them
  // to descriptive names here so the rest of the screen stays readable.
  const parsed = safeParseJson(data).ok() as
    | { bsId?: unknown; pId?: unknown }
    | undefined;
  const ballotStyleId = parsed?.bsId;
  if (typeof ballotStyleId !== 'string') return undefined;
  const precinctId = parsed?.pId;
  return {
    ballotStyleId,
    precinctId: typeof precinctId === 'string' ? precinctId : undefined,
  };
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
 * scanned ballot style QR code and, once one that resolves to a precinct at the
 * configured polling place arrives, shows the blank ballot printing screen
 * locked to that ballot style and language. The precinct comes from the scanned
 * `precinctId` when valid for this polling place, or the sole precinct when the
 * ballot style maps to just one. Until then (or for an ambiguous multi-precinct
 * scan without a valid precinct) it renders {@link whileWaiting}.
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

  const scanned = isFreshScan ? parseScannedQrCode(scan.data) : undefined;

  const normalized = scanned
    ? getDefaultLanguageBallotStyleAndLanguage({
        election,
        ballotStyleId: scanned.ballotStyleId,
      })
    : undefined;

  const precinctsQuery = getPrecinctsForBallotStyle.useQuery(
    normalized?.ballotStyleId
  );

  if (!normalized || !precinctsQuery.isSuccess) {
    return whileWaiting;
  }

  // `precinctIds` are the precincts valid for the scanned ballot style at this
  // machine's polling place. Prefer the scanned precinct when it's one of them;
  // otherwise use the sole precinct. A scanned precinct that isn't valid here, or
  // an ambiguous multi-precinct scan with no precinct, leaves nothing to lock to.
  const precinctIds = precinctsQuery.data;
  const chosenPrecinctId =
    scanned?.precinctId && precinctIds.includes(scanned.precinctId)
      ? scanned.precinctId
      : precinctIds.length === 1
      ? precinctIds[0]
      : undefined;
  if (!chosenPrecinctId) {
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
        precinctId: chosenPrecinctId,
        ballotStyleId: normalized.ballotStyleId,
        languageCode: normalized.languageCode,
      }}
    />
  );
}
