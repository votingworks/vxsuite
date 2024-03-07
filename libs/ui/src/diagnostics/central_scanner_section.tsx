import React from 'react';
import { DiagnosticRecord } from '@votingworks/types';
import { H2, P } from '../typography';
import { InfoIcon, SuccessIcon, WarningIcon } from './icons';

export function CentralScannerSection({
  isScannerAttached,
  mostRecentScannerDiagnostic,
}: {
  isScannerAttached: boolean;
  mostRecentScannerDiagnostic?: DiagnosticRecord;
}): JSX.Element {
  return (
    <React.Fragment>
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
    </React.Fragment>
  );
}
