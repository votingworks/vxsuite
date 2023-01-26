import React from 'react';
import { Prose } from '@votingworks/ui';
import { format } from '@votingworks/utils';
import styled from 'styled-components';
import { Absolute } from './absolute';

interface Props {
  count: number;
}

const BallotsScannedContainer = styled.div`
  padding: 0.5rem 0.75rem;
`;

export function ScannedBallotCount({ count }: Props): JSX.Element {
  return (
    <Absolute top left>
      <BallotsScannedContainer>
        <Prose themeDeprecated={{ fontSize: '1.25rem' }}>
          <p>Ballots Scanned</p>
        </Prose>
        <Prose themeDeprecated={{ fontSize: '3.5rem' }}>
          <p>
            <strong data-testid="ballot-count">{format.count(count)}</strong>
          </p>
        </Prose>
      </BallotsScannedContainer>
    </Absolute>
  );
}
