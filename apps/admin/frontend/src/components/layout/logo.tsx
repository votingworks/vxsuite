/* stylelint-disable order/properties-order */
import React from 'react';
import styled from 'styled-components';

import { LogoMark } from '@votingworks/ui';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  text-align: center;
`;

const LogoMarkContainer = styled.div`
  display: flex;
  justify-content: center;

  > img {
    float: none;
    height: ${(p) => p.theme.sizes.headingsRem.h2}rem;
    margin: 0;
  }
`;

export function Logo(): JSX.Element {
  return (
    <Container>
      <LogoMarkContainer>
        <LogoMark />
      </LogoMarkContainer>
      <span>VxAdmin</span>
    </Container>
  );
}
