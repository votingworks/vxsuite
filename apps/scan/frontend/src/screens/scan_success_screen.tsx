import React from 'react';
import { Font, H1, Icons, P, Section } from '@votingworks/ui';
import styled from 'styled-components';

import { ScreenMainCenterChild } from '../components/layout';

interface Props {
  scannedBallotCount?: number;
}

const StyledIconContainer = styled(Font)`
  font-size: 250px;
  margin-bottom: 0.1em;
`;

export function ScanSuccessScreen({ scannedBallotCount }: Props): JSX.Element {
  return (
    <ScreenMainCenterChild ballotCountOverride={scannedBallotCount}>
      <StyledIconContainer color="success">
        <Icons.Done />
      </StyledIconContainer>
      <Section horizontalAlign="center">
        <H1>Your ballot was counted!</H1>
        <P>Thank you for voting.</P>
      </Section>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <ScanSuccessScreen scannedBallotCount={42} />;
}
