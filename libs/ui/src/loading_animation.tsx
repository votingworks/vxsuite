import styled, { DefaultTheme } from 'styled-components';

const SvgContainer = styled.svg`
  fill: ${(p) => p.theme.colors.onBackground};
  margin: 0 auto 1rem;
  width: 400px;
`;

function getForegroundColor(p: { theme: DefaultTheme }): string {
  return p.theme.colors.primary;
}

const LoadingBar = styled.rect`
  stroke: ${getForegroundColor};
  stroke-width: 3px;
`;

const BackgroundStripe = styled.rect`
  fill: ${(p) => p.theme.colors.background};
`;

const ForegroundStripe = styled.rect`
  fill: ${getForegroundColor};
`;

export function LoadingAnimation(): JSX.Element {
  return (
    <SvgContainer xmlns="http://www.w3.org/2000/svg" viewBox="0 0 93 20">
      <defs>
        <pattern
          width="100"
          height="100"
          id="LoadingAnimation--stripes"
          patternUnits="userSpaceOnUse"
        >
          <g>
            <g transform="skewX(-20)">
              <BackgroundStripe x="-20" y="-10" width="10" height="100" />
              <ForegroundStripe x="-10" y="-10" width="10" height="100" />
              <BackgroundStripe x="0" y="-10" width="10" height="100" />
              <ForegroundStripe x="10" y="-10" width="10" height="100" />
              <BackgroundStripe x="20" y="-10" width="10" height="100" />
              <ForegroundStripe x="30" y="-10" width="10" height="100" />
              <BackgroundStripe x="40" y="-10" width="10" height="100" />
              <ForegroundStripe x="50" y="-10" width="10" height="100" />
              <BackgroundStripe x="60" y="-10" width="10" height="100" />
              <ForegroundStripe x="70" y="-10" width="10" height="100" />
              <BackgroundStripe x="80" y="-10" width="10" height="100" />
              <ForegroundStripe x="90" y="-10" width="10" height="100" />
            </g>
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0 0;20 0"
              keyTimes="0;1"
              dur="1s"
              repeatCount="indefinite"
            />
          </g>
        </pattern>
      </defs>
      <LoadingBar
        rx="8"
        ry="8"
        x="1.5"
        y="1.5"
        width="90"
        height="16"
        fill="url(#LoadingAnimation--stripes)"
      />
    </SvgContainer>
  );
}
