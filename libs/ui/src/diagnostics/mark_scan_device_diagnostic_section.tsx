import { DiagnosticRecord, DiagnosticType } from '@votingworks/types';
import React from 'react';
import { assert } from '@votingworks/basics';
import { H2, P } from '../typography';
import { InfoIcon, SuccessIcon, WarningIcon } from './icons';

export interface MarkScanDeviceDiagnosticSectionProps {
  isDeviceConnected: boolean;
  diagnosticType: DiagnosticType;
  mostRecentDiagnosticRecord?: DiagnosticRecord;
  children?: React.ReactNode;
  title: string;
}

export function MarkScanDeviceDiagnosticSection({
  isDeviceConnected,
  diagnosticType,
  mostRecentDiagnosticRecord,
  children,
  title,
}: MarkScanDeviceDiagnosticSectionProps): JSX.Element {
  if (mostRecentDiagnosticRecord) {
    assert(mostRecentDiagnosticRecord.type === diagnosticType);
  }

  return (
    <section>
      <H2>{title}</H2>
      {isDeviceConnected ? (
        <P>
          <SuccessIcon /> Detected
        </P>
      ) : (
        <P>
          <WarningIcon /> Not detected
        </P>
      )}
      {!mostRecentDiagnosticRecord ? (
        <P>
          <InfoIcon /> No test on record
        </P>
      ) : mostRecentDiagnosticRecord.outcome === 'fail' ? (
        <P>
          <WarningIcon /> Test failed,{' '}
          {new Date(mostRecentDiagnosticRecord.timestamp).toLocaleString()}
          {mostRecentDiagnosticRecord.message
            ? ` — ${mostRecentDiagnosticRecord.message}`
            : ''}
        </P>
      ) : (
        <P>
          <SuccessIcon /> Test passed,{' '}
          {new Date(mostRecentDiagnosticRecord.timestamp).toLocaleString()}
        </P>
      )}
      {children}
    </section>
  );
}
