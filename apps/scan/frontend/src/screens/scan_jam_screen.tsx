import React from 'react';
import { Caption, Font, H1, Icons, P, Section } from '@votingworks/ui';
import styled from 'styled-components';
import { ScreenMainCenterChild } from '../components/layout';

interface Props {
  scannedBallotCount?: number;
}

const StyledIconContainer = styled(Font)`
  font-size: 250px;
  margin-bottom: 0.1em;
`;

export function ScanJamScreen({ scannedBallotCount }: Props): JSX.Element {
  return (
    <ScreenMainCenterChild
      infoBar={false}
      ballotCountOverride={scannedBallotCount}
    >
      <StyledIconContainer color="danger">
        <Icons.DangerX />
      </StyledIconContainer>
      <Section horizontalAlign="center">
        <H1>Ballot Not Counted</H1>
        <P>The ballot is jammed in the scanner.</P>
        <Caption>Ask a poll worker for help.</Caption>
      </Section>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <ScanJamScreen scannedBallotCount={42} />;
}
