/* istanbul ignore file */

import { Caption } from '@votingworks/ui';
import React from 'react';
import styled from 'styled-components';

const Container = styled.div`
  display: grid;
  height: 100%;
  padding: 0 0.75rem;

  > * {
    padding: 0.75rem 0;
  }
`;

export function ManualTallyTab(): React.ReactNode {
  return (
    <Container>
      <Caption>Manual tallies go here.</Caption>
    </Container>
  );
}
