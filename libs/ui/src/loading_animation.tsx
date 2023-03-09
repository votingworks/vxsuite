/* stylelint-disable order/properties-order, value-keyword-case, order/order */
import React from 'react';

import styled, { css } from 'styled-components';

const StyledSvgContainer = styled.svg`
  fill: ${p => p.theme.colors.foreground};
  height: 1em;
`;

const StyledBarRect = styled.rect`
  stroke: ${p => p.theme.colors.accentPrimary};
  stroke-width: 3px;
`;

const StyledBackgroundStripe = styled.rect`
  fill: ${p => p.theme.colors.background};
`;

const StyledForegroundStripe = styled.rect`
  fill: ${p => p.theme.colors.accentPrimary};
`;

export function LoadingAnimation(): JSX.Element {
  return (
    <StyledSvgContainer xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20">
      <defs>
        <pattern width="100" height="100" id="LoadingAnimation--stripes" patternUnits="userSpaceOnUse">
          <g>
            <g transform="skewX(-20)">
              <StyledBackgroundStripe x="-20" y="-10" width="10" height="100" />
              <StyledForegroundStripe x="-10" y="-10" width="10" height="100" />
              <StyledBackgroundStripe x="0" y="-10" width="10" height="100" />
              <StyledForegroundStripe x="10" y="-10" width="10" height="100" />
              <StyledBackgroundStripe x="20" y="-10" width="10" height="100" />
              <StyledForegroundStripe x="30" y="-10" width="10" height="100" />
              <StyledBackgroundStripe x="40" y="-10" width="10" height="100" />
              <StyledForegroundStripe x="50" y="-10" width="10" height="100" />
              <StyledBackgroundStripe x="60" y="-10" width="10" height="100" />
              <StyledForegroundStripe x="70" y="-10" width="10" height="100" />
              <StyledBackgroundStripe x="80" y="-10" width="10" height="100" />
              <StyledForegroundStripe x="90" y="-10" width="10" height="100" />
            </g>
            <animateTransform attributeName="transform" type="translate" values="0 0;20 0" keyTimes="0;1" dur="1s" repeatCount="indefinite" />
          </g>
        </pattern>
      </defs>
      <StyledBarRect rx="8" ry="8" x="1.5" y="1.5" width="90" height="16" fill="url(#LoadingAnimation--stripes)" />
    </StyledSvgContainer>
  );
}
