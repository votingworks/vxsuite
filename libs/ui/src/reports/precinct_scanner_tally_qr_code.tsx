import styled from 'styled-components';
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
  return (
    <div>
      <h1>Quick Results Reporting</h1>
      <QrCodeWrapper
        data-testid="qrcode"
        data-value={signedQuickResultsReportingUrl}
      >
        <QrCode value={signedQuickResultsReportingUrl} />
      </QrCodeWrapper>
    </div>
  );
}
