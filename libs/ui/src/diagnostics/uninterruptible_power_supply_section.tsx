import { assert } from '@votingworks/basics';
import { DiagnosticRecord } from '@votingworks/types';
import { H2, P } from '../typography';
import { InfoIcon, SuccessIcon, WarningIcon } from './icons';

export interface UpsSectionProps {
  upsSectionAdditionalContents?: JSX.Element;
  mostRecentUpsDiagnostic?: DiagnosticRecord;
}

export function UninterruptiblePowerSupplySection(
  props: UpsSectionProps
): JSX.Element {
  const { upsSectionAdditionalContents, mostRecentUpsDiagnostic } = props;

  if (mostRecentUpsDiagnostic) {
    assert(mostRecentUpsDiagnostic.type === 'uninterruptible-power-supply');
  }

  return (
    <section>
      <H2>Uninterruptible Power Supply</H2>
      {!mostRecentUpsDiagnostic ? (
        <P>
          <InfoIcon /> No UPS test on record
        </P>
      ) : mostRecentUpsDiagnostic.outcome === 'fail' ? (
        <P>
          <WarningIcon /> UPS test failed,{' '}
          {new Date(mostRecentUpsDiagnostic.timestamp).toLocaleString()}{' '}
          {mostRecentUpsDiagnostic.message
            ? ` — ${mostRecentUpsDiagnostic.message}`
            : ''}
        </P>
      ) : (
        <P>
          <SuccessIcon /> UPS test successful,{' '}
          {new Date(mostRecentUpsDiagnostic.timestamp).toLocaleString()}
        </P>
      )}
      {upsSectionAdditionalContents}
    </section>
  );
}
