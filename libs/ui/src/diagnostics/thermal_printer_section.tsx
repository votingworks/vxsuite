import type { PrinterStatus } from '@votingworks/fujitsu-thermal-printer';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { DiagnosticRecord } from '@votingworks/types';
import { H2, P } from '../typography';
import { InfoIcon, SuccessIcon, WarningIcon } from './icons';

export interface ThermalPrinterSectionProps {
  printerStatus: PrinterStatus;
  mostRecentPrinterDiagnostic?: DiagnosticRecord;
  printerActionChildren?: React.ReactNode;
}

function PrinterStatusDisplay({
  printerStatus,
}: {
  printerStatus: PrinterStatus;
}): JSX.Element {
  switch (printerStatus.state) {
    case 'idle':
      return (
        <P>
          <SuccessIcon /> The printer is loaded with paper and ready to print.
        </P>
      );
    case 'cover-open':
      return (
        <P>
          <WarningIcon /> The printer roll holder is not attached.
        </P>
      );
    case 'no-paper':
      return (
        <P>
          <WarningIcon /> The printer is not loaded with paper.
        </P>
      );
    case 'error':
      switch (printerStatus.type) {
        case 'disconnected':
          return (
            <P>
              <WarningIcon /> The printer is disconnected. Please contact
              support.
            </P>
          );
        case 'hardware':
          return (
            <P>
              <WarningIcon /> The printer has experienced an unknown hardware
              error. Please contact support.
            </P>
          );
        case 'supply-voltage':
          return (
            <P>
              <WarningIcon /> The printer is not receiving the appropriate power
              supply voltage. Please check the power supply.
            </P>
          );
        case 'temperature':
          return (
            <P>
              <WarningIcon /> The printer is currently overheated. Please wait
              for it to cool down before continuing use.
            </P>
          );
        case 'receive-data':
          return (
            <P>
              <WarningIcon /> The printer has experienced a data error. Please
              restart the machine.
            </P>
          );
        // istanbul ignore next
        default:
          throwIllegalValue(printerStatus.type);
      }
    // istanbul ignore next
    // eslint-disable-next-line no-fallthrough
    default:
      throwIllegalValue(printerStatus, 'state');
  }
}

export function ThermalPrinterSection({
  printerStatus,
  mostRecentPrinterDiagnostic,
  printerActionChildren,
}: ThermalPrinterSectionProps): JSX.Element {
  if (mostRecentPrinterDiagnostic) {
    assert(mostRecentPrinterDiagnostic.type === 'test-print');
  }

  return (
    <section>
      <H2>Printer</H2>
      {printerActionChildren}
      <PrinterStatusDisplay printerStatus={printerStatus} />
      {!mostRecentPrinterDiagnostic ? (
        <P>
          <InfoIcon /> No test print on record
        </P>
      ) : mostRecentPrinterDiagnostic.outcome === 'fail' ? (
        <P>
          <WarningIcon /> Test print failed,{' '}
          {new Date(mostRecentPrinterDiagnostic.timestamp).toLocaleString()}{' '}
          {mostRecentPrinterDiagnostic.message
            ? ` — ${mostRecentPrinterDiagnostic.message}`
            : ''}
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
