import styled from 'styled-components';
// import { sign } from 'node:crypto';
import { QrCode } from '../qrcode';

const QrCodeWrapper = styled.div`
  width: 25%;
`;

export interface PrecinctScannerTallyQrCodeProps {
  signedQuickResultsReportingUrl: string;
}

export function PrecinctScannerTallyQrCode({
  signedQuickResultsReportingUrl,
}: PrecinctScannerTallyQrCodeProps): JSX.Element {
  const encoding = 'M';
  const testQrStringNumPrefix = `48976`; // 4 = digit encoding chars, 8976 = total num ballots.
  const numRepeats = 635;
  const testNum4Digit = '01234'.repeat(numRepeats);
  console.log(
    `testQRString num byte length: ${
      new TextEncoder().encode(testQrStringNumPrefix + testNum4Digit).length
    }`
  );

  return (
    <div>
      <h1>Quick Results Reporting</h1>
      <p>
        {numRepeats} 4 digit numbers encoded at {encoding}
      </p>
      <QrCodeWrapper
        data-testid="qrcode"
        data-value={signedQuickResultsReportingUrl}
      >
        <QrCode
          value={[
            signedQuickResultsReportingUrl,
            testQrStringNumPrefix + testNum4Digit,
          ]}
          level={encoding}
        />
      </QrCodeWrapper>
    </div>
  );
}
