import { assert } from '@votingworks/basics';
import { DiagnosticRecord } from '@votingworks/types';
import { H2, P } from '../typography.js';
import { InfoIcon, SuccessIcon, WarningIcon } from './icons.js';

export interface ScanAudioSectionProps {
  audioSectionAdditionalContents?: React.ReactNode;
  mostRecentAudioDiagnostic?: DiagnosticRecord;
}

export function ScanAudioSection(props: ScanAudioSectionProps): JSX.Element {
  const { audioSectionAdditionalContents, mostRecentAudioDiagnostic } = props;

  if (mostRecentAudioDiagnostic) {
    assert(mostRecentAudioDiagnostic.type === 'scan-audio');
  }

  return (
    <section>
      <H2>Speaker</H2>
      {!mostRecentAudioDiagnostic ? (
        <P>
          <InfoIcon /> No sound test on record
        </P>
      ) : mostRecentAudioDiagnostic.outcome === 'fail' ? (
        <P>
          <WarningIcon /> Sound test failed,{' '}
          {new Date(mostRecentAudioDiagnostic.timestamp).toLocaleString()}{' '}
          {mostRecentAudioDiagnostic.message
            ? ` — ${mostRecentAudioDiagnostic.message}`
            : ''}
        </P>
      ) : (
        <P>
          <SuccessIcon /> Sound test successful,{' '}
          {new Date(mostRecentAudioDiagnostic.timestamp).toLocaleString()}
        </P>
      )}
      {audioSectionAdditionalContents}
    </section>
  );
}
