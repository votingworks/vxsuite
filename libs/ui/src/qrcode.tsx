import { QRCodeSVG } from 'qrcode.react';
import styled from 'styled-components';

const ResponsiveSvgWrapper = styled.div`
  & > svg {
    display: block; /* svg is "inline" by default */
    width: 100%; /* reset width */
    height: auto; /* reset height */
  }
`;

export type QrCodeLevel = 'L' | 'M' | 'Q' | 'H';

export interface QrCodeProps {
  value: string;
  level?: QrCodeLevel;
}

export function QrCode({ level = 'H', value }: QrCodeProps): JSX.Element {
  return (
    <ResponsiveSvgWrapper>
      <QRCodeSVG value={value} level={level} />
    </ResponsiveSvgWrapper>
  );
}
