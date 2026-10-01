import type { DiagnosticRecord, PrinterStatus } from '@votingworks/types';
import React from 'react';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { H2, P } from '../typography.js';
import { InfoIcon, LoadingIcon, SuccessIcon, WarningIcon } from './icons.js';
import {
  IPP_PRINTER_STATE_REASON_MESSAGES,
  parseHighestPriorityIppPrinterStateReason,
} from '../utils/printer_state_reasons.js';

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
      default: {
        throwIllegalValue(state);
      }
    }
  })();

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const marker = richStatus.markerInfos[0]!;
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
  printerDiagnosticUi?: React.ReactNode;
  printerStatus: PrinterStatus;
  mostRecentPrinterDiagnostic?: DiagnosticRecord;
}

export function PrinterSection({
  printerDiagnosticUi,
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
      {printerDiagnosticUi}
    </section>
  );
}
