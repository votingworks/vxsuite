import {
  DiagnosticRecord,
  PrinterStatus,
  IppPrinterStateReason,
} from '@votingworks/types';
import React from 'react';
import { Optional, assert, throwIllegalValue } from '@votingworks/basics';
import { H2, P } from '../typography';
import { InfoIcon, LoadingIcon, SuccessIcon, WarningIcon } from './icons';

/**
 * IPP printer-state-reasons explain what's going on with a printer in detail.
 * Here, we map them to a human-readable explanation, both for user-friendliness
 * and developer documentation.
 * Spec: https://datatracker.ietf.org/doc/shtml/rfc2911#section-4.4.12
 * There are more possible reasons than covered in the spec, so this list is not
 * exhaustive.
 *
 * Note that the actual printer-state-reasons sent by the printer may have a
 * suffix of either: "-report", "-warning", or "-error" (e.g. "media-jam-error").
 */
export const IPP_PRINTER_STATE_REASON_MESSAGES: {
  [reason: IppPrinterStateReason]: string;
} = {
  'media-needed': 'The printer is out of paper. Add paper to the printer.',
  'media-jam': 'The printer has a paper jam. Open cover and remove paper.',
  'moving-to-paused': 'The printer is pausing. Restart the printer.',
  paused: 'The printer is paused. Restart the printer.',
  shutdown: 'The printer is turned off or disconnected. Restart the printer.',
  'timed-out': 'The printer is not responding. Restart the printer.',
  stopping: 'The printer is stopping. Restart the printer.',
  'stopped-partly': 'The printer is stopped. Restart the printer.',
  'toner-low': 'The printer is low on toner. Replace toner cartridge.',
  'toner-empty': 'The printer is low on toner. Replace toner cartridge.',
  'spool-area-full': 'The spool area is full. Restart the printer.',
  'cover-open': "The printer's cover is open. Close the printer's cover.",
  'interlock-open': "The printer's door is open. Close the printer's door.",
  'door-open': "The printer's door is open. Close the printer's door.",
  'input-tray-missing':
    "The printer's input tray is missing. Connect the input tray.",
  'media-low': 'The printer is low on paper. Add paper to the printer.',
  // HP printers use "media-empty" when the tray is simply open, so this message
  // was changed to mention that possibility.
  'media-empty':
    'The printer does not detect any paper. Either the paper tray is open or the printer is out of paper.',
  'output-tray-missing':
    "The printer's output tray is missing. Connect the output tray.",
  'output-area-almost-full':
    "The printer's output tray is almost full. Remove printed documents.",
  'output-area-full':
    "The printer's output tray is full. Remove printed documents.",
  'marker-supply-low': 'The printer is low on toner. Replace toner cartridge.',
  'marker-supply-empty':
    'The printer is out of toner. Replace toner cartridge.',
  'marker-waste-almost-full':
    "The printer's toner waste cartridge is almost full. Empty the toner waste cartridge.",
  'marker-waste-full':
    "The printer's toner waste receptacle is full. Empty the toner waste cartridge.",
  'fuser-over-temp':
    "The printer's fuser temperature is above normal. Restart the printer.",
  'fuser-under-temp':
    "The printer's fuser temperature is below normal. Restart the printer.",
  'opc-near-eol':
    "The printer's optical photo conductor is near end of life. Replace this printer.",
  'opc-life-over':
    "The printer's optical photo conductor is no longer functioning. Replace this printer.",
} as const;

export function parseHighestPriorityIppPrinterStateReason(
  printerStateReasons: IppPrinterStateReason[]
): Optional<string> {
  return printerStateReasons
    .map((printerStateReason) => {
      const [, reason, level] = Array.from(
        /^([a-z-]+?)(?:-(report|warning|error))?$/.exec(printerStateReason) ||
          []
      );
      return [reason, level];
    })
    .filter(([reason]) => reason)
    .filter(([reason]) => reason !== 'none')
    .sort(([, level1], [, level2]) => {
      function levelRank(level?: string) {
        return level === 'error' ? 0 : level === 'warning' ? 1 : 2;
      }
      return levelRank(level1) - levelRank(level2);
    })
    .map(([reason]) => reason)[0];
}

export function PrinterStatusDisplay({
  printerStatus,
}: {
  printerStatus: PrinterStatus;
}): JSX.Element {
  if (printerStatus.connected === false) {
    return (
      <P>
        <InfoIcon /> No compatible printer detected
      </P>
    );
  }

  const { config, richStatus } = printerStatus;

  if (!config.supportsIpp) {
    return (
      <P>
        <SuccessIcon /> Connected
      </P>
    );
  }

  if (!richStatus) {
    return (
      <P>
        <SuccessIcon /> Connected
      </P>
    );
  }

  const { state, stateReasons } = richStatus;
  const highestPriorityStateReason =
    parseHighestPriorityIppPrinterStateReason(stateReasons);

  const statusMessage = (() => {
    switch (state) {
      case 'idle':
        if (highestPriorityStateReason === 'sleep-mode') {
          return (
            <P>
              <InfoIcon /> Sleep mode is on - Press any button on the printer to
              wake it.
            </P>
          );
        }

        return (
          <P>
            <SuccessIcon /> Ready to print
          </P>
        );
      case 'processing':
        return (
          <P>
            <LoadingIcon /> Printing
          </P>
        );
      case 'stopped':
        return (
          <P>
            <WarningIcon /> Stopped
            {highestPriorityStateReason
              ? ` - ${
                  IPP_PRINTER_STATE_REASON_MESSAGES[
                    highestPriorityStateReason
                  ] ?? highestPriorityStateReason
                }`
              : ''}
          </P>
        );
      /* istanbul ignore next */
      default:
        throwIllegalValue(state);
    }
  })();

  const marker = richStatus.markerInfos[0];
  const markerLow = marker.level <= marker.lowLevel;
  return (
    <React.Fragment>
      {statusMessage}{' '}
      <P>
        {markerLow ? <WarningIcon /> : <SuccessIcon />} Toner Level:{' '}
        {marker.level}%
      </P>
    </React.Fragment>
  );
}

export interface PrinterSectionProps {
  printerStatus: PrinterStatus;
  mostRecentPrinterDiagnostic?: DiagnosticRecord;
}

export function PrinterSection({
  printerStatus,
  mostRecentPrinterDiagnostic,
}: PrinterSectionProps): JSX.Element {
  if (mostRecentPrinterDiagnostic) {
    assert(mostRecentPrinterDiagnostic.type === 'test-print');
  }

  return (
    <section>
      <H2>Printer</H2>
      <PrinterStatusDisplay printerStatus={printerStatus} />
      {!mostRecentPrinterDiagnostic ? (
        <P>
          <InfoIcon /> No test print on record
        </P>
      ) : mostRecentPrinterDiagnostic.outcome === 'fail' ? (
        <P>
          <WarningIcon /> Test print failed,{' '}
          {new Date(mostRecentPrinterDiagnostic.timestamp).toLocaleString()}
        </P>
      ) : (
        <P>
          <SuccessIcon /> Test print successful,{' '}
          {new Date(mostRecentPrinterDiagnostic.timestamp).toLocaleString()}
        </P>
      )}
    </section>
  );
}
