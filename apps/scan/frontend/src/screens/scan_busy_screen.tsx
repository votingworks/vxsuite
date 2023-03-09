import React from 'react';
import { Caption, Font, H1, Icons, P, Section, Text } from '@votingworks/ui';
import styled from 'styled-components';
import { ExclamationTriangle } from '../components/graphics';
import {
  CenteredLargeProse,
  ScreenMainCenterChild,
} from '../components/layout';

const StyledIconContainer = styled(Font)`
  font-size: 250px;
`;

export function ScanBusyScreen(): JSX.Element {
  return (
    <ScreenMainCenterChild infoBar={false}>
      <StyledIconContainer color="warning">
        <Icons.Warning />
      </StyledIconContainer>
      <Section horizontalAlign="center">
        <H1>Remove Your Ballot</H1>
        <P>Another ballot is being scanned.</P>
        <Caption>Ask a poll worker if you need help.</Caption>
      </Section>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <ScanBusyScreen />;
}
