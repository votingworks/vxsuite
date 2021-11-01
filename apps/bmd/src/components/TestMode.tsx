import React from 'react';
import styled from 'styled-components';

import { Text } from './Text';

const TestingModeContainer = styled(Text)`
  border: 0.5rem solid;
  padding: 0.5rem;
`;

interface Props {
  isLiveMode: boolean;
}

export function TestMode({ isLiveMode }: Props): JSX.Element {
  return isLiveMode ? (
    <React.Fragment />
  ) : (
    <TestingModeContainer warning bold warningIcon center>
      Testing Mode
    </TestingModeContainer>
  );
}
