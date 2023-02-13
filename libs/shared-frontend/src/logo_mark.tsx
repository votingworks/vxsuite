import React from 'react';
import styled from 'styled-components';

const LogoMarkStyled = styled.img`
  float: right;
  margin: 0 0 1em 2em;
  height: 0.25in;
`;

/**
 * VotingWorks logo graphic.
 */
export function LogoMark(): JSX.Element {
  return (
    <LogoMarkStyled
      src="/votingworks-wordmark-black.svg"
      alt="VotingWorks logo"
    />
  );
}
