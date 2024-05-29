import { DiagnosticRecord } from '@votingworks/types';
import { assert } from '@votingworks/basics';
import { H2, P } from '../typography';
import { InfoIcon, SuccessIcon, WarningIcon } from './icons';

export interface CentralScannerSectionProps {
  isScannerAttached: boolean;
  mostRecentScannerDiagnostic?: DiagnosticRecord;
}

export function CentralScannerSection({
  isScannerAttached,
  mostRecentScannerDiagnostic,
}: CentralScannerSectionProps): JSX.Element {
  if (mostRecentScannerDiagnostic) {
    assert(mostRecentScannerDiagnostic.type === 'blank-sheet-scan');
  }

  return (
    <section>
      <H2>Scanner</H2>
      {isScannerAttached ? (
        <P>
          <SuccessIcon /> Connected
        </P>
      ) : (
        <P>
          <InfoIcon /> No scanner detected
        </P>
      )}
      {!mostRecentScannerDiagnostic ? (
        <P>
          <InfoIcon /> No test scan on record
        </P>
      ) : mostRecentScannerDiagnostic.outcome === 'fail' ? (
        <P>
          <WarningIcon /> Test scan failed,{' '}
          {new Date(mostRecentScannerDiagnostic.timestamp).toLocaleString()}
        </P>
      ) : (
        <P>
          <SuccessIcon /> Test scan successful,{' '}
          {new Date(mostRecentScannerDiagnostic.timestamp).toLocaleString()}
        </P>
      )}
    </section>
  );
}
