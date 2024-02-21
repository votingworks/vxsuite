import styled from 'styled-components';

import { H1 } from '@votingworks/ui';
import { ScannedBallotCount } from './scanned_ballot_count';
import { VoterSettingsButton } from './voter_settings_button';

interface ScreenHeaderProps {
  ballotCount?: number;
  title?: string;
}

const Container = styled.div`
  display: flex;
  gap: 0.25rem;
  padding: 0.25rem;
  justify-content: space-between;
  align-items: center;
`;

export function ScreenHeader(props: ScreenHeaderProps): JSX.Element | null {
  const { ballotCount, title } = props;

  return (
    <Container>
      <div>
        {ballotCount !== undefined && (
          <ScannedBallotCount count={ballotCount} />
        )}
      </div>
      {title && <H1 style={{ margin: 0 }}>{title}</H1>}
      <VoterSettingsButton />
    </Container>
  );
}
