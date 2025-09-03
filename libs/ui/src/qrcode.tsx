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
  value: string | string[];
  level?: QrCodeLevel;
}

export function QrCode({ level = 'M', value }: QrCodeProps): JSX.Element {
  return (
    <ResponsiveSvgWrapper>
      <QRCodeSVG value={value} level={level} size={500} />
    </ResponsiveSvgWrapper>
  );
}
