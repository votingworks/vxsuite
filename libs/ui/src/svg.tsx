import styled from 'styled-components';

export class Svg {
  static BackgroundFillPath = styled.path`
    fill: ${(p) => p.theme.colors.background};
  `;

  static ForegroundFillPath = styled.path`
    fill: ${(p) => p.theme.colors.onBackground};
  `;

  static FullScreenSvg = styled.svg`
    fill: ${(p) => p.theme.colors.onBackground};
    margin: 0 auto;
    width: min(40vw, 40vh);

    &:not(:last-child) {
      margin-bottom: 1rem;
    }
  `;

  static PrimaryFillPath = styled.path`
    fill: ${(p) => p.theme.colors.primary};
  `;

  static PrimaryPolygon = styled.polygon`
    fill: ${(p) => p.theme.colors.primary};
  `;
}
