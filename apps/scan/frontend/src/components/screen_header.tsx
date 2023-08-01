import styled from 'styled-components';

import { ScannedBallotCount } from './scanned_ballot_count';
import { DisplaySettingsButton } from './display_settings_button';

interface ScreenHeaderProps {
  ballotCount?: number;
}

const Container = styled.div`
  display: flex;
  gap: 0.25rem;
  padding: 0.25rem;
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
