import styled from 'styled-components';
import { Svg } from './svg';

const StyledForegroundRect = styled.rect`
  fill: none;
  stroke: ${(p) => p.theme.colors.onBackground};
  stroke-width: 8px;
`;

export function RotateCardImage(): JSX.Element {
  return (
    <Svg.FullScreenSvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
      <StyledForegroundRect x="146" y="81" width="220" height="350" rx="22" />
      <Svg.PrimaryFillPath d="M258.56 512h-5.12v-35.72h5.12Zm0-59.53h-5.12v-35.73h5.12Zm0-59.54h-5.12v-35.72h5.12Zm0-59.53h-5.12v-35.73h5.12Zm0-59.54h-5.12v-35.72h5.12Zm0-59.53h-5.12V178.6h5.12Zm0-59.54h-5.12v-35.72h5.12Zm0-59.53h-5.12V59.53h5.12Zm0-59.54h-5.12V0h5.12Z" />
      <Svg.PrimaryFillPath d="m449 206.54 5-18.21a5.93 5.93 0 0 0-1.65-5.89 6 6 0 0 0-6-1.34l-45.91 15.25a6 6 0 0 0-2.62 9.6l31.83 36.32a6 6 0 0 0 4.49 2 5.52 5.52 0 0 0 1.34-.16 6 6 0 0 0 4.42-4.24l4.92-18c37.3 12.11 51.3 25.68 51.3 34.8 0 10.38-17.53 26.17-66.75 39.38-46.2 12.39-107.76 19.22-173.34 19.22s-127.14-6.83-173.34-19.22c-49.22-13.21-66.75-29-66.75-39.38 0-11.3 21.39-29.35 81.66-43l-3.52-15.52C51.14 207.88 0 226 0 256.69c0 48.4 131.9 74.51 256 74.51s256-26.11 256-74.51c0-23.48-29.9-39.54-63-50.15Z" />
    </Svg.FullScreenSvg>
  );
}
