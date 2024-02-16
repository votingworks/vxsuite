import { Optional } from '@votingworks/basics';
import {
  IppPrinterState,
  IppPrinterStateReason,
  PrinterRichStatus,
} from '@votingworks/types';
import React from 'react';
import { Icons } from './icons';
import { P } from './typography';

const IPP_PRINTER_STATE_DISPLAY_TEXT: Record<IppPrinterState, string> = {
  idle: 'Ready',
  processing: 'Processing',
  stopped: 'Stopped',
};

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
  'sleep-mode':
    'The printer is in sleep mode. Press any button on the printer to wake it.', // Custom reason added by us
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
  'media-empty': 'The printer is out of paper. Add paper to the printer.',
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

export function PrinterRichStatusDisplay({
  state,
  stateReasons,
  markerInfos,
}: PrinterRichStatus): JSX.Element {
  const highestPriorityStateReason =
    parseHighestPriorityIppPrinterStateReason(stateReasons);
  const marker = markerInfos[0];
  const markerLow = marker.level <= marker.lowLevel;

  return (
    <React.Fragment>
      <P>
        {state === 'stopped' ? (
          <Icons.Warning color="warning" />
        ) : state === 'processing' ? (
          <Icons.Loading />
        ) : highestPriorityStateReason === 'sleep-mode' ? (
          // Sleep mode doesn't indicate any problem, but we want to display it
          // differently than plain "idle" to encourage waking it up and showing
          // any currently hidden status messages.
          <Icons.Info />
        ) : (
          <Icons.Done color="success" />
        )}{' '}
        {IPP_PRINTER_STATE_DISPLAY_TEXT[state]}
        {highestPriorityStateReason
          ? ` - ${
              IPP_PRINTER_STATE_REASON_MESSAGES[highestPriorityStateReason] ??
              highestPriorityStateReason
            }`
          : ''}
      </P>
      <P>
        {markerLow ? (
          <Icons.Warning color="warning" />
        ) : (
          <Icons.Done color="success" />
        )}{' '}
        Toner Level: {marker.level}%
      </P>
    </React.Fragment>
  );
}
