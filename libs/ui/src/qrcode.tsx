import { QRCodeSVG } from 'qrcode.react';
import styled from 'styled-components';

const ResponsiveSvgWrapper = styled.div`
  & > svg {
    display: block; /* svg is "inline" by default */
    width: 100%; /* reset width */
    height: auto; /* reset height */
  }
`;

/**
 * Using a higher level makes a QR code more resilient to damage or distortion but also requires
 * a larger/denser QR code.
 */
export type QrCodeLevel = 'L' | 'M' | 'Q' | 'H';

/**
 * Our QR codes are generally displayed on high-fidelity screens or printed with high-fidelity
 * printers, so the highest error correction levels are in most cases unnecessary. In fact, for
 * some of our larger QR codes, e.g., SHV QR codes, we've found that the highest levels make the QR
 * codes so large/dense that some phones have trouble reading them.
 *
 * We can override with higher levels when we need to optimize for resilience, e.g., summary
 * ballots printed on lower-fidelity thermal printers. And we can override with lower levels when
 * we need to optimize for space constraints, e.g., HMP ballots.
 */
const DEFAULT_QR_CODE_LEVEL: QrCodeLevel = 'M';

export interface QrCodeProps {
  value: string;
  level?: QrCodeLevel;
  size?: number;
}

export function QrCode({
  level = DEFAULT_QR_CODE_LEVEL,
  value,
  size,
}: QrCodeProps): JSX.Element {
  return (
    <ResponsiveSvgWrapper>
      <QRCodeSVG value={value} level={level} size={size} />
    </ResponsiveSvgWrapper>
  );
}
