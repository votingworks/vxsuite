/* stylelint-disable order/properties-order */
import React from 'react';
import styled from 'styled-components';

import { ScannedBallotCount } from './scanned_ballot_count';
import { DisplaySettingsButton } from './display_settings_button';

interface ScreenHeaderProps {
  ballotCount?: number;
}

const Container = styled.div`
  display: flex;
  padding: 0.25rem 0.25rem;
  justify-content: space-between;
`;

export function ScreenHeader(props: ScreenHeaderProps): JSX.Element | null {
  const { ballotCount } = props;

  return (
    <Container>
      <div>
        {ballotCount !== undefined && (
          <ScannedBallotCount count={ballotCount} />
        )}
      </div>
      <DisplaySettingsButton />
    </Container>
  );
}
